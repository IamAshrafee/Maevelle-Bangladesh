import { redirect } from 'next/navigation';

export default function MeasurementsRedirectPage() {
  redirect('/sizing/standards?tab=measurements');
}
