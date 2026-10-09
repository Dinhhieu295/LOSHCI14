import { useEffect, useState, type FormEvent } from 'react';
import { MapPin, Pencil, Phone, UserRound, X } from 'lucide-react';
import { api, type User } from './api';

type ProfileDraft = Pick<User, 'fullName' | 'dob' | 'phone' | 'location' | 'bio'>;
type Props = { user: User; onSaved: (user: User) => void; onNotice: (message: string) => void };

const toDraft = (user: User): ProfileDraft => ({
  fullName: user.fullName,
  dob: user.dob,
  phone: user.phone ?? '',
  location: user.location ?? '',
  bio: user.bio ?? '',
});

export default function ProfileEditor({ user, onSaved, onNotice }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(user));

  useEffect(() => setDraft(toDraft(user)), [user]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const updated = await api<User>('/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          ...draft,
          phone: draft.phone?.trim() || null,
          location: draft.location?.trim() || null,
          bio: draft.bio?.trim() || null,
        }),
      });
      onSaved(updated);
      setEditing(false);
      onNotice('Đã cập nhật trang cá nhân.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Không lưu được thông tin cá nhân.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="panel profile-panel">
    <div className="panel-heading">
      <div><h3>Thông tin cá nhân</h3><p>Thông tin này được lưu trong tài khoản của bạn.</p></div>
      {!editing && <button className="soft-button" onClick={() => setEditing(true)}><Pencil size={15}/> Chỉnh sửa hồ sơ</button>}
    </div>
    {editing ? <form className="profile-form" onSubmit={event => void save(event)}>
      <label>Họ và tên<input autoComplete="name" value={draft.fullName} onChange={event => setDraft({ ...draft, fullName: event.target.value })} required maxLength={120}/></label>
      <label>Ngày sinh<input type="date" value={draft.dob ?? ''} onChange={event => setDraft({ ...draft, dob: event.target.value || null })}/></label>
      <label>Số điện thoại<input type="tel" autoComplete="tel" value={draft.phone ?? ''} onChange={event => setDraft({ ...draft, phone: event.target.value })} maxLength={40} placeholder="Số điện thoại"/></label>
      <label>Nơi ở<input autoComplete="address-level2" value={draft.location ?? ''} onChange={event => setDraft({ ...draft, location: event.target.value })} maxLength={120} placeholder="Thành phố hoặc khu vực"/></label>
      <label className="profile-bio-field">Giới thiệu<textarea value={draft.bio ?? ''} onChange={event => setDraft({ ...draft, bio: event.target.value })} maxLength={500} rows={3} placeholder="Viết vài dòng về bạn"/></label>
      <div className="profile-form-actions"><button className="soft-button" type="button" onClick={() => { setDraft(toDraft(user)); setEditing(false); }}><X size={15}/> Hủy</button><button className="primary-button" disabled={busy}><UserRound size={15}/>{busy ? 'Đang lưu…' : 'Lưu hồ sơ'}</button></div>
    </form> : <div className="profile-summary">
      <div className="profile-avatar"><UserRound size={22}/></div>
      <div className="profile-summary-main"><strong>{user.fullName}</strong><span>{user.email}</span>{user.bio && <p>{user.bio}</p>}</div>
      <div className="profile-details">
        <span><Phone size={14}/>{user.phone || 'Chưa thêm số điện thoại'}</span>
        <span><MapPin size={14}/>{user.location || 'Chưa thêm nơi ở'}</span>
        <span>Ngày sinh: {user.dob ? new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${user.dob}T00:00:00`)) : 'Chưa thêm'}</span>
      </div>
    </div>}
  </section>;
}
