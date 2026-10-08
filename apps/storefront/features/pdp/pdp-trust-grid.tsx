import { BikeIcon, BanknoteIcon, ShieldCheckIcon } from '@/components/ui/icons';

export function PdpTrustGrid() {
  return (
    <section className="px-4 pt-5">
      <div className="p-4 rounded-2xl bg-[#faf2ee] flex flex-col gap-3.5">
        {/* Swift City Delivery */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#eee7e3] flex items-center justify-center text-[#9e2a4b] shrink-0 mt-0.5">
            <BikeIcon size={18} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-[#1e1b19]">Swift City Delivery</span>
            <span className="text-[12px] text-[#574144]">
              Dhaka ৳70 (Next-day) &bull; Outside Dhaka ৳130 (2–3 days)
            </span>
          </div>
        </div>

        {/* Cash on Delivery & Instant Pay */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#eee7e3] flex items-center justify-center text-[#9e2a4b] shrink-0 mt-0.5">
            <BanknoteIcon size={18} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-[#1e1b19]">Cash on Delivery &amp; Instant Pay</span>
            <span className="text-[12px] text-[#574144]">
              COD across 64 districts &bull; bKash, Nagad accepted
            </span>
          </div>
        </div>

        {/* 7-Day Return & Doorstep Verification */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#eee7e3] flex items-center justify-center text-[#9e2a4b] shrink-0 mt-0.5">
            <ShieldCheckIcon size={18} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-[#1e1b19]">7-Day Return &amp; Doorstep Verification</span>
            <span className="text-[12px] text-[#574144]">
              Inspect fabric texture upon rider delivery with zero hassle
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
