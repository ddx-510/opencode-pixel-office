type BossBoxProps = {
  message: string;
  status: string;
};

const BossBox = ({ message, status }: BossBoxProps) => (
  <div className="boss-message-box">
    <div className="flex justify-between items-baseline mb-2">
      <div className="text-[9px] uppercase tracking-widest font-bold">Boss Says</div>
      {status ? <div className="text-[8px] uppercase px-2 py-0.5 bg-amber-200/50 rounded border border-amber-700/30">{status}</div> : null}
    </div>
    <p className="text-[10px] leading-relaxed">{message}</p>
  </div>
);

export { BossBox };
