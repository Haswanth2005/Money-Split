import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X, Trash2 } from 'lucide-react';
import type { ParsedCSVRow, CSVRowIssue } from '../utils/csvParser';
import type { GroupMember } from '../types';

interface Props {
  rows: ParsedCSVRow[];
  members: GroupMember[];
  onUpdateRow: (id: string, updates: Partial<ParsedCSVRow>) => void;
  onDeleteRow: (id: string) => void;
}

export default function ImportReviewTable({ rows, members, onUpdateRow, onDeleteRow }: Props) {
  
  const renderIssueIcon = (issues: CSVRowIssue[]) => {
    if (issues.length === 0) return <CheckCircle className="text-success w-5 h-5" />;
    
    if (issues.some(i => i.type === 'error')) {
      return <AlertCircle className="text-error w-5 h-5" />;
    }
    if (issues.some(i => i.type === 'warning')) {
      return <AlertTriangle className="text-warning w-5 h-5" />;
    }
    return <Info className="text-blue-500 w-5 h-5" />;
  };

  const getRowClassName = (row: ParsedCSVRow) => {
    if (row.ignored) return 'opacity-50 bg-gray-50 dark:bg-gray-800/30';
    if (row.issues.some(i => i.type === 'error')) return 'bg-red-50/30 dark:bg-red-900/10';
    return '';
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Paid By</th>
            <th className="px-4 py-3 font-medium">Split With</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {rows.map((row) => (
            <React.Fragment key={row.id}>
              <tr className={`group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${getRowClassName(row)}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {renderIssueIcon(row.issues)}
                    {row.ignored && <span className="text-xs font-medium text-gray-500 uppercase">Ignored</span>}
                    {row.isSettlement && <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Settlement</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input 
                    type="date"
                    className="input h-8 text-sm w-36"
                    value={row.date}
                    onChange={(e) => {
                      const newIssues = row.issues.filter(i => i.field !== 'date');
                      onUpdateRow(row.id, { date: e.target.value, issues: newIssues });
                    }}
                  />
                </td>
                <td className="px-4 py-3 max-w-[200px] truncate" title={row.description}>
                  {row.description || <span className="text-gray-400 italic">No description</span>}
                </td>
                <td className="px-4 py-3 font-mono font-medium">
                  {row.amount} {row.currency}
                </td>
                <td className="px-4 py-3">
                  <select 
                    className={`input h-8 text-sm min-w-[120px] ${row.issues.some(i => i.field === 'paid_by' && i.type === 'error') ? 'input-error' : ''}`}
                    value={row.paid_by || ''}
                    onChange={(e) => {
                      const newIssues = row.issues.filter(i => i.field !== 'paid_by');
                      onUpdateRow(row.id, { paid_by: e.target.value, issues: newIssues });
                    }}
                  >
                    <option value="" disabled>Select Payer...</option>
                    {members.map(m => (
                      <option key={m.id} value={m.users?.full_name || m.user_id}>
                        {m.users?.full_name || 'Unknown'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 max-w-[150px] truncate" title={row.split_with.join(', ')}>
                  {row.split_with.length} people
                </td>
                <td className="px-4 py-3 text-right">
                  <button 
                    onClick={() => onDeleteRow(row.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Ignore/Delete Row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
              {/* Display issues below the row if there are any */}
              {row.issues.length > 0 && !row.ignored && (
                <tr className={getRowClassName(row)}>
                  <td colSpan={7} className="px-4 pb-3 pt-0">
                    <div className="flex flex-col gap-1 mt-1">
                      {row.issues.map((issue, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          {issue.type === 'error' && <X className="w-3.5 h-3.5 text-error mt-0.5 shrink-0" />}
                          {issue.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />}
                          {issue.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />}
                          <span className={
                            issue.type === 'error' ? 'text-error font-medium' : 
                            issue.type === 'warning' ? 'text-warning' : 'text-gray-500'
                          }>
                            {issue.message}
                            {issue.field === 'duplicate' && issue.type === 'error' && (
                              <button 
                                onClick={() => {
                                  // Mark duplicate as resolved
                                  const newIssues = row.issues.filter(i => i.field !== 'duplicate');
                                  onUpdateRow(row.id, { issues: newIssues });
                                }}
                                className="ml-2 underline hover:text-red-700"
                              >
                                Keep anyway
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
