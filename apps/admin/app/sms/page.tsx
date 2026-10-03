import type { Metadata } from 'next';
import { SmsOperationsConsole } from '@/components/sms/sms-operations-console';

export const metadata: Metadata = { title: 'SMS Operations · Maevelle Admin', description: 'Transactional SMS operations, templates, policies, suppressions, and provider diagnostics.' };
export default function SmsOperationsPage() { return <SmsOperationsConsole />; }
