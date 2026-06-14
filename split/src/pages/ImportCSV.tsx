import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { ArrowLeft, Upload, FileType, CheckCircle2 } from 'lucide-react'
import type { GroupMember } from '../types'
import { parseCSV } from '../utils/csvParser'
import type { ParsedCSVRow } from '../utils/csvParser'
import ImportReviewTable from '../components/ImportReviewTable'

async function fetchGroupData(groupId: string) {
  const [groupRes, membersRes] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).single(),
    supabase.from('group_members').select('*, users(id, email, full_name)').eq('group_id', groupId),
  ])
  return {
    group: groupRes.data,
    members: (membersRes.data || []) as GroupMember[],
  }
}

export function ImportCSV() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedCSVRow[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['group-import', id],
    queryFn: () => fetchGroupData(id!),
    enabled: !!id,
  })

  const group = data?.group
  const members = data?.members || []

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsParsing(true);
    try {
      const rows = await parseCSV(selectedFile, members, 'INR');
      setParsedRows(rows);
    } catch (error) {
      console.error("Failed to parse CSV", error);
      alert("Error parsing CSV");
    } finally {
      setIsParsing(false);
    }
  };

  const handleUpdateRow = (rowId: string, updates: Partial<ParsedCSVRow>) => {
    setParsedRows(prev => prev.map(r => r.id === rowId ? { ...r, ...updates } : r));
  };

  const handleDeleteRow = (rowId: string) => {
    setParsedRows(prev => prev.map(r => r.id === rowId ? { ...r, ignored: true } : r));
  };

  const hasBlockingErrors = parsedRows.some(r => !r.ignored && r.issues.some(i => i.type === 'error'));
  const validRows = parsedRows.filter(r => !r.ignored);

  const resolveUserId = (nameOrId: string) => {
    const member = members.find(m => m.users?.full_name === nameOrId || m.user_id === nameOrId);
    return member?.user_id;
  };

  const handleImport = async () => {
    if (hasBlockingErrors || validRows.length === 0) return;
    setIsImporting(true);

    try {
      // 1. Fetch existing expenses to build deduplication fingerprint set
      const existingRes = await supabase.from('expenses').select('date, description, amount, paid_by').eq('group_id', id);
      const existingExpenses = existingRes.data || [];
      const fingerprintSet = new Set(existingExpenses.map(e => `${e.date}|${e.description}|${e.amount}|${e.paid_by}`));

      // Create records sequentially or in batch
      for (const row of validRows) {
        let finalAmount = row.amount;
        let finalCurrency = row.currency || 'INR';

        // 2. USD conversion (fixed rate for demo)
        if (finalCurrency.toUpperCase() === 'USD') {
           finalAmount = Math.round(row.amount * 83.5 * 100) / 100;
           finalCurrency = 'INR';
        }

        const payerId = resolveUserId(row.paid_by || '');
        if (!payerId && !row.is_draft) throw new Error(`Could not resolve user ID for payer: ${row.paid_by}`);

        // Deduplication Check
        if (!row.isSettlement) {
           const dbPayerId = row.is_draft ? 'null' : payerId;
           const fp = `${row.date}|${row.description}|${finalAmount}|${dbPayerId}`;
           if (fingerprintSet.has(fp)) {
             console.log(`Skipping duplicate import: ${fp}`);
             continue; 
           }
        }

        if (row.isSettlement) {
          // It's a settlement
          const payeeName = row.split_with[0] || '';
          const payeeId = resolveUserId(payeeName) || user!.id;
          
          await supabase.from('settlements').insert({
            group_id: id,
            paid_by: payerId,
            paid_to: payeeId,
            amount: finalAmount,
            date: row.date || new Date().toISOString(),
            status: 'SETTLED',
            payment_method: 'cash',
            note: row.description,
            created_by: user!.id
          });
        } else {
          // It's an expense
          const expenseRes = await supabase.from('expenses').insert({
            group_id: id,
            description: row.description,
            amount: finalAmount,
            currency: finalCurrency,
            paid_by: row.is_draft ? null : payerId,
            is_draft: row.is_draft || false,
            split_type: row.split_type,
            date: row.date,
            created_by: user!.id
          }).select('id').single();

          if (expenseRes.error) throw expenseRes.error;
          const expenseId = expenseRes.data.id;

          // Resolve split participants
          const splitParticipants = row.split_with.map(name => ({
            name,
            userId: resolveUserId(name)
          })).filter(p => p.userId); // ignore unresolvable if they slip through

          if (splitParticipants.length === 0) {
             // Fallback: everyone in group
             members.forEach(m => {
               splitParticipants.push({ name: m.users?.full_name || '', userId: m.user_id });
             });
          }

          const splits = splitParticipants.map(p => ({
            expense_id: expenseId,
            user_id: p.userId!,
            owed_share: finalAmount / splitParticipants.length, // Default equal split
            share_units: null
          }));

          // 3. Handle exact/shares/percentage
          if (row.split_details) {
             const parts = row.split_details.split(';');
             let totalShares = 0;
             let shareMap: Record<string, number> = {};
             
             parts.forEach(part => {
               // match e.g. "Aisha 30%", "Rohan 700", "Priya 2"
               const match = part.match(/([a-zA-Z\s]+)\s+([\d.]+)/);
               if (match) {
                 const name = match[1].trim();
                 const val = parseFloat(match[2]);
                 const userId = resolveUserId(name);
                 if (userId) {
                   shareMap[userId] = val;
                   totalShares += val;
                 }
               }
             });

             const stype = row.split_type;
             if (stype === 'percentage') {
                splits.forEach(s => {
                  if (shareMap[s.user_id]) {
                    s.owed_share = Math.round((finalAmount * shareMap[s.user_id]) / 100 * 100) / 100;
                  } else {
                    s.owed_share = 0;
                  }
                });
             } else if (stype === 'shares' || stype === 'share') {
                splits.forEach(s => {
                  if (shareMap[s.user_id] && totalShares > 0) {
                    s.owed_share = Math.round((finalAmount * shareMap[s.user_id]) / totalShares * 100) / 100;
                  } else {
                    s.owed_share = 0;
                  }
                });
             } else if (stype === 'exact' || stype === 'unequal') {
                splits.forEach(s => {
                  if (shareMap[s.user_id]) {
                    s.owed_share = shareMap[s.user_id];
                  } else {
                    s.owed_share = 0;
                  }
                });
             }
          }

          if (splits.length > 0) {
            await supabase.from('expense_splits').insert(splits);
          }
        }
      }

      setImportSuccess(true);
    } catch (err: any) {
      console.error(err);
      alert("Error during import: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return <div className="page-body">Loading...</div>
  }

  if (importSuccess) {
    return (
      <div className="page-body">
        <div className="empty-state">
          <CheckCircle2 className="text-success w-16 h-16 mb-4" />
          <h2 className="display-md">Import Successful</h2>
          <p className="text-muted">Successfully imported {validRows.length} records.</p>
          <button onClick={() => navigate(`/groups/${id}`)} className="btn btn-primary mt-6">
            Back to Group
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate(`/groups/${id}`)} className="btn btn-ghost btn-sm" aria-label="Go back">
              <ArrowLeft size={16} />
            </button>
            <div>
              <p className="caption" style={{ marginBottom: 2 }}>{group?.name}</p>
              <h1 className="display-lg">Import CSV</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {!file && (
          <div className="card max-w-xl mx-auto mt-8">
            <div className="empty-state">
              <FileType className="text-gray-400 w-12 h-12 mb-2" />
              <h3 className="title-md">Upload Expenses CSV</h3>
              <p className="text-muted text-sm text-center mb-6">
                Upload your `expenses_export.csv` file here. We will analyze it for any data inconsistencies before importing.
              </p>
              <label className="btn btn-primary cursor-pointer">
                <Upload size={16} />
                Select CSV File
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        )}

        {isParsing && (
          <div className="flex justify-center my-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}

        {file && !isParsing && parsedRows.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="title-md">Review Import Data</h2>
                <p className="text-muted text-sm">
                  Found {parsedRows.length} rows. {hasBlockingErrors ? 'Please resolve the highlighted errors before importing.' : 'Everything looks good to import!'}
                </p>
              </div>
              <button 
                className="btn btn-primary"
                disabled={hasBlockingErrors || isImporting || validRows.length === 0}
                onClick={handleImport}
              >
                {isImporting ? 'Importing...' : `Import ${validRows.length} Rows`}
              </button>
            </div>

            {hasBlockingErrors && (
              <div className="p-4 bg-red-50 text-red-800 rounded-lg text-sm flex gap-2">
                <span className="font-semibold">Action Required:</span>
                Some rows have errors that need your attention (missing payers, unrecognized members, or potential duplicates).
              </div>
            )}

            <ImportReviewTable 
              rows={parsedRows} 
              members={members} 
              onUpdateRow={handleUpdateRow}
              onDeleteRow={handleDeleteRow}
            />
          </div>
        )}
      </div>
    </div>
  )
}
