import { useT } from "../../i18n";

export default function WizardEffects() {
  const t = useT().wizard;
  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {t.effectsTitle}
      </h1>
      <p className="muted wz-sub">{t.effectsSub}</p>
    </>
  );
}
