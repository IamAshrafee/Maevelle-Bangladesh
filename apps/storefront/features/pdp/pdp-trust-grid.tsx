import { BikeIcon, BanknoteIcon } from '@/components/ui/icons';

export function PdpTrustGrid() {
  return (
    <section className="px-4 pt-5">
      <div className="p-4 rounded-2xl bg-[#faf2ee] border border-border/40 flex flex-col gap-3">
        {/* Nationwide Delivery */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#eee7e3] flex items-center justify-center text-primary shrink-0 mt-0.5">
            <BikeIcon size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-[#1e1b19]">Nationwide Express Delivery</span>
            <span className="text-[12px] text-[#574144] mt-0.5 leading-relaxed">
              Inside Dhaka ৳60 (Next Day) · Outside Dhaka ৳120 (2–3 Days)
            </span>
          </div>
        </div>

        <div className="h-px bg-border/40" />

        {/* Cash on delivery & Mobile Banking */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#eee7e3] flex items-center justify-center text-primary shrink-0 mt-0.5">
            <BanknoteIcon size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-[#1e1b19]">
              Cash on Delivery &amp; Mobile Banking
            </span>
            <span className="text-[12px] text-[#574144] mt-0.5 leading-relaxed">
              Cash on Delivery across all 64 districts · bKash, Nagad &amp; Cards accepted.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
