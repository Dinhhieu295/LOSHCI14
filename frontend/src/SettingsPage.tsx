import { Bell, Moon } from 'lucide-react';
import './planning.css';

export default function SettingsPage({ dark, reminders, onTheme, onReminders }: {
  dark: boolean;
  reminders: boolean;
  onTheme: (enabled: boolean) => void;
  onReminders: (enabled: boolean) => void;
}) {
  return <div className="planning-page">
    <header className="planning-heading"><h1>Cài đặt</h1></header>
    <section className="panel planning-panel" aria-label="Tùy chọn cá nhân">
      <label className="planning-check">
        <Moon size={17} aria-hidden="true" /> Giao diện tối
        <input type="checkbox" checked={dark} onChange={(event) => onTheme(event.target.checked)} />
      </label>
      <label className="planning-check">
        <Bell size={17} aria-hidden="true" /> Nhắc hạn
        <input type="checkbox" checked={reminders} onChange={(event) => onReminders(event.target.checked)} />
      </label>
    </section>
  </div>;
}
