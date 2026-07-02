import { useEffect, useRef } from "react";
import { LocationCard } from "./LocationCard";
import { OrientationCard } from "./OrientationCard";
import { SettingsCard } from "./SettingsCard";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Modal holding the rarely-touched setup: location, orientation, comfort & home. */
export function SettingsDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog ref={ref} className="settings-dialog" onClose={onClose}>
      <div className="settings-dialog__head">
        <h1>Settings</h1>
        <button onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>
      <div className="settings-dialog__body">
        <LocationCard />
        <OrientationCard />
        <SettingsCard />
      </div>
      <button className="primary mt" onClick={onClose}>
        Done
      </button>
    </dialog>
  );
}
