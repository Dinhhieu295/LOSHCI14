import { useEffect, useState, type FormEvent } from 'react';
import { Bell, KeyRound, Moon } from 'lucide-react';
import { api, assistantProviders, type AiProvider } from './api';
import './planning.css';

type AiSettings = {
  configured: boolean;
  hasPersonalKey: boolean;
  canSaveKey: boolean;
  provider: AiProvider;
  model: string;
  defaultModels: Record<AiProvider, string>;
  savedModels?: Partial<Record<AiProvider, string>>;
  availableProviders?: AiProvider[];
  ollamaRequiresKey?: boolean;
};

const path = '/assistant/settings';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Không cập nhật được cài đặt AI.';

export default function SettingsPage({ dark, reminders, onTheme, onReminders }: {
  dark: boolean;
  reminders: boolean;
  onTheme: (enabled: boolean) => void;
  onReminders: (enabled: boolean) => void;
}) {
  const [settings, setSettings] = useState<AiSettings>();
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<AiSettings>(path, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setSettings(result);
      setProvider(result.provider);
      setModel(result.model);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(errorText(reason));
    });
    return () => controller.abort();
  }, [attempt]);

  async function update(method: 'PUT' | 'DELETE') {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await api<AiSettings>(method === 'DELETE' ? `${path}?provider=${provider}` : path, {
        method,
        body: method === 'PUT' ? JSON.stringify({ provider, model: model.trim() || undefined, apiKey: apiKey.trim() || undefined }) : undefined,
      });
      setSettings(result);
      setProvider(result.provider);
      setModel(result.model);
      setApiKey('');
      setStatus(provider === 'ollama' ? (method === 'PUT' ? 'Đã lưu kết nối Ollama.' : 'Đã gỡ kết nối Ollama.')
        : (method === 'PUT' ? 'Đã lưu khóa AI.' : 'Đã gỡ khóa AI cá nhân.'));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  const save = (event: FormEvent) => { event.preventDefault(); void update('PUT'); };
  const needsKey = provider !== 'ollama' || settings?.ollamaRequiresKey !== false;
  const keyLabel = provider === 'ollama' ? 'Mã kết nối Ollama' : 'API key';
  const selectedHasKey = Boolean(settings?.savedModels?.[provider] ?? (settings?.provider === provider && settings.hasPersonalKey));

  return <div className="planning-page lifeos-settings">
    <header className="planning-heading"><h1>Cài đặt</h1></header>
    <section className="panel planning-panel" aria-labelledby="ai-settings-title">
      <div className="planning-section-head">
        <h2 id="ai-settings-title"><KeyRound size={17} aria-hidden="true" /> Trợ lý AI</h2>
        {settings && <span className="planning-pill">{settings.provider === 'ollama' && settings.configured ? 'Đã kết nối Ollama'
          : settings.hasPersonalKey ? 'Đã lưu khóa cá nhân' : settings.configured ? 'Dùng khóa máy chủ' : 'Chưa kết nối'}</span>}
      </div>
      {settings ? <>
        {settings.canSaveKey ? <form className="planning-editor ai-settings-form" onSubmit={save}>
          <label className="planning-field">Nhà cung cấp
            <select value={provider} disabled={busy} onChange={(event) => {
              const next = event.target.value as AiProvider;
              setProvider(next);
              setModel(settings.savedModels?.[next] ?? (next === settings.provider ? settings.model : settings.defaultModels[next]));
              setApiKey('');
              setStatus('');
              setError('');
            }}>
              {(settings.availableProviders ?? ['openai', 'gemini', 'groq'] as const).map((id) => (
                <option key={id} value={id}>{assistantProviders[id]}</option>
              ))}
            </select>
          </label>
          <label className="planning-field">Model
            <input value={model} disabled={busy} maxLength={100} placeholder={settings.defaultModels[provider]}
              onChange={(event) => setModel(event.target.value)} />
          </label>
          {needsKey && <label className="planning-field ai-settings-key">{keyLabel}
            <input type="password" autoComplete="new-password" spellCheck={false} minLength={12} maxLength={512} value={apiKey}
              required={!selectedHasKey} disabled={busy}
              placeholder={selectedHasKey ? 'Đã lưu. Nhập mã mới nếu muốn thay đổi' : `Nhập ${keyLabel}`}
              onChange={(event) => setApiKey(event.target.value)} />
          </label>}
          <div className="planning-actions ai-settings-key">
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? 'Đang xử lý…' : 'Lưu kết nối'}
            </button>
            {selectedHasKey && <button type="button" className="soft-button" disabled={busy}
              onClick={() => void update('DELETE')}>Gỡ khóa</button>}
            {provider === 'groq' && <a className="soft-button" href="https://console.groq.com/keys" target="_blank"
              rel="noreferrer">Tạo khóa GroqCloud</a>}
          </div>
        </form> : <p>Máy chủ cần cấu hình lưu khóa AI cá nhân.</p>}
      </> : !error && <p role="status">Đang tải cài đặt…</p>}
      {!settings && error && <button type="button" className="soft-button" onClick={() => {
        setError(''); setAttempt((value) => value + 1);
      }}>Thử lại</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
    </section>
    <section className="panel planning-panel settings-preferences" aria-label="Tùy chọn cá nhân">
      <label><Moon size={17} aria-hidden="true" /><span>Giao diện tối</span>
        <input type="checkbox" checked={dark} onChange={(event) => onTheme(event.target.checked)} />
      </label>
      <label><Bell size={17} aria-hidden="true" /><span>Nhắc hạn</span>
        <input type="checkbox" checked={reminders} onChange={(event) => onReminders(event.target.checked)} />
      </label>
    </section>
  </div>;
}
