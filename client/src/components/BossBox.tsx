type BossBoxProps = {
  message: string;
  status: string;
};

const BossBox = ({ message, status }: BossBoxProps) => (
  <div className="boss-box">
    <div className="boss-header">
      <div className="boss-title">Boss Says</div>
      {status ? <div className="boss-status">{status}</div> : null}
    </div>
    <p>{message}</p>
  </div>
);

export { BossBox };
