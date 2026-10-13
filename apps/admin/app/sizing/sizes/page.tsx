import { redirect } from 'next/navigation';

export default function SizesRedirectPage() {
  redirect('/sizing/standards?tab=sizes');
}
