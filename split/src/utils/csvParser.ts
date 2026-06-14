import Papa from 'papaparse';
import { isValid, parse, format } from 'date-fns';
import type { SplitMechanism, GroupMember } from '../types';

export interface CSVRowIssue {
  type: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
}

export interface ParsedCSVRow {
  id: string; // UI tracking ID
  originalRow: Record<string, string>;

  date: string;
  description: string;
  paid_by: string | null;
  amount: number;
  currency: string;
  split_type: SplitMechanism | string;
  split_with: string[];
  split_details: string;
  notes: string;

  isSettlement: boolean;
  ignored: boolean;
  is_draft?: boolean;
  issues: CSVRowIssue[];
}

// Generate a random ID for the UI
const generateId = () => Math.random().toString(36).substring(2, 9);

export const parseCSV = async (
  file: File,
  groupMembers: GroupMember[],
  defaultCurrency: string = 'INR'
): Promise<ParsedCSVRow[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = processRows(results.data, groupMembers, defaultCurrency);
        resolve(parsedRows);
      },
      error: (error: any) => {
        reject(error);
      }
    });
  });
};

const processRows = (
  rawRows: Record<string, string>[],
  groupMembers: GroupMember[],
  defaultCurrency: string
): ParsedCSVRow[] => {
  const parsedRows: ParsedCSVRow[] = [];

  // Track seen descriptions to find duplicates
  const seenMap = new Map<string, string>(); // key -> row id

  rawRows.forEach((row, index) => {
    const issues: CSVRowIssue[] = [];
    const id = generateId();

    // 1. Commas in Amount & 15. Excessive Precision
    let rawAmount = row.amount || '';
    if (rawAmount.includes(',')) {
      issues.push({ type: 'warning', field: 'amount', message: 'Commas stripped from amount.' });
      rawAmount = rawAmount.replace(/,/g, '');
    }

    let amount = parseFloat(rawAmount);
    if (isNaN(amount)) amount = 0;

    // Check precision
    const amountStr = amount.toString();
    if (amountStr.includes('.') && amountStr.split('.')[1].length > 2) {
      issues.push({ type: 'warning', field: 'amount', message: 'Amount rounded to 2 decimal places.' });
      amount = Math.round(amount * 100) / 100;
    }

    // 12. Zero amounts
    let ignored = false;
    if (amount === 0) {
      issues.push({ type: 'warning', field: 'amount', message: 'Zero amount ignored.' });
      ignored = true;
    }

    // 11. Negative Amounts (Refunds)
    if (amount < 0) {
      issues.push({ type: 'warning', field: 'amount', message: 'Database does not support negative amounts. This refund row will be ignored.' });
      ignored = true;
    }

    // 5. Disguised Settlements
    const description = (row.description || '').trim();
    const splitType = (row.split_type || '').trim().toLowerCase();
    const notes = (row.notes || '').toLowerCase();
    let isSettlement = false;

    const descLower = description.toLowerCase();
    const isOneOnOne = (row.split_with || '').split(';').length === 1;

    if (
      descLower.includes('paid') ||
      descLower.includes('settlement') ||
      descLower.includes('deposit') ||
      notes.includes('paid')
    ) {
      if (!splitType || splitType === '' || isOneOnOne) {
        isSettlement = true;
        issues.push({ type: 'warning', field: 'type', message: 'Detected as a settlement, not an expense.' });
      }
    }

    // 3. Missing Payer
    let paid_by = (row.paid_by || '').trim();
    if (!paid_by && !ignored) {
      issues.push({ type: 'error', field: 'paid_by', message: 'Missing payer. Please select one.' });
      paid_by = null as any;
    }

    // 2. Name Inconsistencies & 9. Unrecognized Members
    const membersByName = new Map<string, GroupMember>();
    groupMembers.forEach(m => {
      if (m.users?.full_name) {
        membersByName.set(m.users.full_name.toLowerCase(), m);
      }
    });

    let is_draft = false;

    if (paid_by) {
      const lowerName = paid_by.toLowerCase();

      // Exact case-insensitive match first
      if (membersByName.has(lowerName)) {
        const correctName = membersByName.get(lowerName)!.users!.full_name;
        if (correctName !== paid_by) {
          issues.push({ type: 'warning', field: 'paid_by', message: `Payer name standardized to ${correctName}.` });
          paid_by = correctName;
        }
      } else {
        // Fuzzy match: check if the member name is contained in the paid_by string (e.g. "Priya S" contains "Priya")
        let fuzzyMatch = false;
        for (const [memName, memObj] of membersByName.entries()) {
          if (lowerName.includes(memName) || memName.includes(lowerName)) {
            const correctName = memObj.users!.full_name;
            issues.push({ type: 'warning', field: 'paid_by', message: `Payer name standardized to ${correctName}.` });
            paid_by = correctName;
            fuzzyMatch = true;
            break;
          }
        }
        if (!fuzzyMatch) {
          issues.push({ type: 'error', field: 'paid_by', message: `Unrecognized payer: ${paid_by}.` });
        }
      }
    } else {
      if (!isSettlement && !ignored) {
        issues.push({ type: 'warning', field: 'paid_by', message: `Missing payer. Will be imported as a Draft Expense.` });
        is_draft = true;
      }
    }

    // 4. Missing Currency
    let currency = (row.currency || '').trim();
    if (!currency && !ignored) {
      issues.push({ type: 'warning', field: 'currency', message: `Currency defaulted to ${defaultCurrency}.` });
      currency = defaultCurrency;
    }

    // 8. Multiple Currencies
    if (currency && currency !== defaultCurrency && !ignored) {
      issues.push({ type: 'info', field: 'currency', message: `Different currency detected (${currency}).` });
    }



    // 7. Ambiguous/Mixed Dates
    let dateStr = (row.date || '').trim();
    let parsedDate = '';

    // Try formats
    const formatsToTry = ['yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'MMM d'];
    let validDate = null;

    for (const fmt of formatsToTry) {
      const d = parse(dateStr, fmt, new Date());
      if (isValid(d)) {
        validDate = d;
        if (fmt !== 'yyyy-MM-dd') {
          issues.push({ type: 'warning', field: 'date', message: `Date parsed from format ${fmt}.` });
        }
        break;
      }
    }

    if (validDate) {
      parsedDate = format(validDate, 'yyyy-MM-dd');
    } else {
      issues.push({ type: 'error', field: 'date', message: `Unrecognized date format: ${dateStr}` });
      parsedDate = dateStr; // leave as is for user to fix
    }

    // 10. Duplicates
    let isDup = false;
    for (const [key, id_val] of seenMap.entries()) {
      const [seenDate, seenDesc, seenAmt] = key.split('|');
      if (seenDate === parsedDate) {
        // Same date. Check if amounts match exactly, OR if descriptions are very similar
        const amtDiff = Math.abs(parseFloat(seenAmt) - Math.abs(amount));

        // Basic fuzzy string overlap
        const descWords = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const seenWords = seenDesc.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const commonWords = descWords.filter(w => seenWords.includes(w));

        if (amtDiff < 1 || commonWords.length > 0) {
          isDup = true;
          break;
        }
      }
    }

    if (isDup) {
      issues.push({ type: 'error', field: 'duplicate', message: 'Potential duplicate entry detected.' });
    } else {
      seenMap.set(`${parsedDate}|${description}|${Math.abs(amount)}`, id);
    }

    // 14. Conflicting Split Data
    const splitDetails = (row.split_details || '').trim();
    let finalSplitType = splitType;
    if (splitType === 'equal' && splitDetails && splitDetails.includes(';')) {
      issues.push({ type: 'warning', field: 'split_type', message: 'Split type "equal" conflicts with provided split details. Overridden.' });
      // Infer from details
      if (splitDetails.includes('%')) finalSplitType = 'percentage';
      else if (splitDetails.match(/\d+$/)) finalSplitType = 'shares'; // simplistic
    }

    // Map common CSV terms to DB enums
    if (finalSplitType === 'unequal') finalSplitType = 'exact';
    if (finalSplitType === 'share') finalSplitType = 'shares';

    // 6. Percentages not summing to 100%
    if (finalSplitType === 'percentage' && splitDetails) {
      const parts = splitDetails.split(';');
      let total = 0;
      parts.forEach(p => {
        const match = p.match(/(\d+(?:\.\d+)?)\s*%/);
        if (match) total += parseFloat(match[1]);
      });
      if (total > 0 && Math.abs(total - 100) > 0.01) {
        issues.push({ type: 'warning', field: 'split_details', message: `Percentages sum to ${total}%, not 100%. Will be normalized.` });
      }
    }

    // 13. Ex-members / Unrecognized in Split
    const splitWith = (row.split_with || '').split(';').map(s => s.trim()).filter(s => s);
    const resolvedSplitWith: string[] = [];
    splitWith.forEach(person => {
      const lower = person.toLowerCase();
      let found = false;

      if (membersByName.has(lower)) {
        found = true;
        resolvedSplitWith.push(membersByName.get(lower)!.users!.full_name);
      } else {
        // Fuzzy match
        for (const [memName, memObj] of membersByName.entries()) {
          if (lower.includes(memName) || memName.includes(lower)) {
            resolvedSplitWith.push(memObj.users!.full_name);
            found = true;
            break;
          }
        }
      }

      if (!found && !isSettlement) {
        issues.push({ type: 'warning', field: 'split_with', message: `Unrecognized person in split: ${person}. They will be excluded.` });
      } else if (!found && isSettlement) {
        resolvedSplitWith.push(person);
      }
    });

    // Replace the row.split_with with the resolved names so we don't try to look up unrecognized names later
    // The unresolved ones are dropped, as per policy
    const finalSplitWith = isSettlement ? resolvedSplitWith : resolvedSplitWith.filter(name => membersByName.has(name.toLowerCase()));

    parsedRows.push({
      id,
      originalRow: row,
      date: parsedDate,
      description,
      paid_by,
      amount,
      currency,
      split_type: finalSplitType,
      split_with: finalSplitWith,
      split_details: splitDetails,
      notes: (row.notes || '').trim(),
      isSettlement,
      ignored,
      is_draft,
      issues
    });
  });

  return parsedRows;
};
