import type { ReactNode } from "react";
import { addDays, formatDateLabel } from "./dateUtils";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export function IconButton({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="icon-btn" type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

// 「◀ 日付 ▶」。日付の文字を押すとブラウザ標準の日付選択が開く
export function DateSwitcher({ date, onMove }: { date: string; onMove: (date: string) => void }) {
  return (
    <div className="date-switcher">
      <IconButton icon="chevron-left" label="前の日" onClick={() => onMove(addDays(date, -1))} />
      <label className="date-jump">
        <span className="date-label">{formatDateLabel(date)}</span>
        <input
          aria-label="日付を選ぶ"
          type="date"
          value={date}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              // showPicker が使えない環境では、標準の入力欄の動きに任せる
            }
          }}
          onChange={(event) => {
            if (event.target.value) onMove(event.target.value);
          }}
        />
      </label>
      <IconButton icon="chevron-right" label="次の日" onClick={() => onMove(addDays(date, 1))} />
    </div>
  );
}

export function AppBar({ children }: { children: ReactNode }) {
  return <header className="app-bar">{children}</header>;
}
