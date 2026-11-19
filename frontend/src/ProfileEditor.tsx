import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Lock, MapPin, Pencil, Phone, RotateCcw, ShieldCheck, UserRound, X } from 'lucide-react';
import { api, changePassword, getToken, type NoticeHandler, type User } from './api';

type ProfileDraft = Pick<User, 'fullName' | 'dob' | 'avatarUrl' | 'phone' | 'location' | 'bio'>;
type Props = {
  user: User;
  onSaved: (user: User) => void;
  onNotice: NoticeHandler;
  onSessionExpired?: () => void;
};

const toDraft = (user: User): ProfileDraft => ({
  fullName: user.fullName,
  dob: user.dob,
  avatarUrl: user.avatarUrl ?? '',
  phone: user.phone ?? '',
  location: user.location ?? '',
  bio: user.bio ?? '',
});

export default function ProfileEditor({ user, onSaved, onNotice, onSessionExpired }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [draft, setDraft] = useState<ProfileDraft>(() => toDraft(user));

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  useEffect(() => setDraft(toDraft(user)), [user]);

  const executeSaveProfile = async () => {
    if (busy) return;
    setProfileError('');
    if (!draft.fullName.trim()) {
      setProfileError('Họ và tên không được để trống.');
      return;
    }
    const trimmedAvatar = draft.avatarUrl?.trim() || null;
    if (trimmedAvatar) {
      try {
        new URL(trimmedAvatar);
      } catch {
        setProfileError('URL ảnh đại diện không hợp lệ (cần bắt đầu bằng http:// hoặc https://).');
        return;
      }
    }
    setBusy(true);
    try {
      const updated = await api<User>('/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: draft.fullName.trim(),
          dob: draft.dob || null,
          avatarUrl: trimmedAvatar,
          phone: draft.phone?.trim() || null,
          location: draft.location?.trim() || null,
          bio: draft.bio?.trim() || null,
        }),
      });
      onSaved(updated);
      setEditing(false);
      onNotice({ message: 'Đã cập nhật trang cá nhân.', type: 'success' });
    } catch (error) {
      if (!getToken()) {
        onSessionExpired?.();
        return;
      }
      const msg = error instanceof Error ? error.message : 'Không lưu được thông tin cá nhân.';
      setProfileError(msg);
      onNotice({
        message: msg,
        type: 'error',
        retry: () => void executeSaveProfile(),
        retryLabel: 'Thử lưu lại',
      });
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await executeSaveProfile();
  };

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setPwdError('');
  };

  const executePasswordChange = async () => {
    if (pwdBusy) return;
    setPwdError('');
    setPwdSuccess('');
    if (!currentPassword) {
      setPwdError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < 8) {
      setPwdError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    if (newPassword === currentPassword) {
      setPwdError('Mật khẩu mới cần khác mật khẩu hiện tại.');
      return;
    }
    setPwdBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      resetPasswordForm();
      setShowPasswordForm(false);
      const successMsg = 'Đã đổi mật khẩu thành công. Các phiên đăng nhập trên thiết bị khác đã được thu hồi.';
      setPwdSuccess(successMsg);
      onNotice({ message: successMsg, type: 'success' });
    } catch (error) {
      if (!getToken()) {
        onSessionExpired?.();
        return;
      }
      const message = error instanceof Error ? error.message : 'Không thể đổi mật khẩu.';
      setPwdError(message);
      onNotice({
        message,
        type: 'error',
        retry: () => void executePasswordChange(),
        retryLabel: 'Thử lại',
      });
    } finally {
      setPwdBusy(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await executePasswordChange();
  };

  return (
    <>
      <section className="panel profile-panel">
        <div className="panel-heading">
          <div>
            <h3>Thông tin cá nhân</h3>
            <p>Thông tin này được lưu trong tài khoản của bạn.</p>
          </div>
          <div className="profile-header-actions">
            {!editing && (
              <button
                type="button"
                className="soft-button"
                aria-expanded={editing}
                onClick={() => {
                  setProfileError('');
                  setEditing(true);
                }}
              >
                <Pencil size={15} /> Chỉnh sửa hồ sơ
              </button>
            )}
            <button
              type="button"
              className="soft-button"
              aria-expanded={showPasswordForm}
              onClick={() => {
                if (showPasswordForm) {
                  resetPasswordForm();
                  setShowPasswordForm(false);
                } else {
                  setPwdError('');
                  setPwdSuccess('');
                  setShowPasswordForm(true);
                }
              }}
            >
              <KeyRound size={15} /> {showPasswordForm ? 'Đóng đổi mật khẩu' : 'Đổi mật khẩu'}
            </button>
          </div>
        </div>

        {editing ? (
          <form className="profile-form" onSubmit={(event) => void save(event)}>
            <label>
              Họ và tên
              <input
                autoComplete="name"
                value={draft.fullName}
                onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
                required
                maxLength={120}
                aria-invalid={Boolean(profileError && !draft.fullName.trim())}
                aria-describedby={profileError ? 'profile-form-error' : undefined}
              />
            </label>
            <label>
              Ngày sinh
              <input
                type="date"
                value={draft.dob ?? ''}
                onChange={(event) => setDraft({ ...draft, dob: event.target.value || null })}
              />
            </label>
            <label>
              Số điện thoại
              <input
                type="tel"
                autoComplete="tel"
                value={draft.phone ?? ''}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                maxLength={40}
                placeholder="Số điện thoại"
              />
            </label>
            <label>
              Nơi ở
              <input
                autoComplete="address-level2"
                value={draft.location ?? ''}
                onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                maxLength={120}
                placeholder="Thành phố hoặc khu vực"
              />
            </label>
            <label className="profile-bio-field">
              URL ảnh đại diện (tùy chọn)
              <input
                type="url"
                value={draft.avatarUrl ?? ''}
                onChange={(event) => setDraft({ ...draft, avatarUrl: event.target.value })}
                maxLength={2048}
                placeholder="https://example.com/avatar.png"
                aria-describedby={profileError ? 'profile-form-error' : undefined}
              />
            </label>
            <label className="profile-bio-field">
              Giới thiệu
              <textarea
                value={draft.bio ?? ''}
                onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
                maxLength={500}
                rows={3}
                placeholder="Viết vài dòng về bạn"
              />
            </label>
            {profileError && (
              <div id="profile-form-error" className="form-error profile-bio-field" role="alert">
                <span>{profileError}</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void executeSaveProfile()}
                  disabled={busy}
                >
                  <RotateCcw size={13} /> Thử lưu lại
                </button>
              </div>
            )}
            <div className="profile-form-actions">
              <button
                className="soft-button"
                type="button"
                onClick={() => {
                  setDraft(toDraft(user));
                  setProfileError('');
                  setEditing(false);
                }}
              >
                <X size={15} /> Hủy
              </button>
              <button className="primary-button" disabled={busy}>
                <UserRound size={15} />
                {busy ? 'Đang lưu…' : 'Lưu hồ sơ'}
              </button>
            </div>
          </form>
        ) : (
          <div className="profile-summary">
            <div className="profile-avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.fullName} className="profile-avatar-img" />
              ) : (
                <UserRound size={22} />
              )}
            </div>
            <div className="profile-summary-main">
              <strong>{user.fullName}</strong>
              <span>{user.email}</span>
              {user.bio && <p>{user.bio}</p>}
            </div>
            <div className="profile-details">
              <span>
                <Phone size={14} />
                {user.phone || 'Chưa thêm số điện thoại'}
              </span>
              <span>
                <MapPin size={14} />
                {user.location || 'Chưa thêm nơi ở'}
              </span>
              <span>
                Ngày sinh:{' '}
                {user.dob
                  ? new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(
                      new Date(`${user.dob}T00:00:00`),
                    )
                  : 'Chưa thêm'}
              </span>
            </div>
          </div>
        )}

        {pwdSuccess && !showPasswordForm && (
          <div className="password-success-banner" role="status">
            <ShieldCheck size={16} />
            <span>{pwdSuccess}</span>
            <button type="button" className="icon-button" aria-label="Đóng thông báo" onClick={() => setPwdSuccess('')}>
              <X size={14} />
            </button>
          </div>
        )}

        {showPasswordForm && (
          <form className="password-change-form" onSubmit={(event) => void handlePasswordSubmit(event)}>
            <div className="password-form-header">
              <div>
                <h4>
                  <Lock size={15} /> Đổi mật khẩu bảo mật
                </h4>
                <p>Mật khẩu mới cần tối thiểu 8 ký tự. Phiên hiện tại được giữ nguyên, các thiết bị khác sẽ đăng xuất.</p>
              </div>
            </div>
            <div className="password-form-grid">
              <label>
                Mật khẩu hiện tại
                <span className="password-field">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Nhập mật khẩu hiện tại"
                    required
                    maxLength={128}
                    aria-describedby={pwdError ? 'password-form-error' : undefined}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowCurrent((v) => !v)}
                    aria-label={showCurrent ? 'Ẩn mật khẩu hiện tại' : 'Hiện mật khẩu hiện tại'}
                  >
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>
              <label>
                Mật khẩu mới
                <span className="password-field">
                  <input
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Ít nhất 8 ký tự"
                    required
                    minLength={8}
                    maxLength={128}
                    aria-describedby={pwdError ? 'password-form-error' : undefined}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowNew((v) => !v)}
                    aria-label={showNew ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
                  >
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>
              <label>
                Xác nhận mật khẩu mới
                <span className="password-field">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    required
                    minLength={8}
                    maxLength={128}
                    aria-invalid={Boolean(confirmPassword && newPassword !== confirmPassword)}
                    aria-describedby={pwdError ? 'password-form-error' : undefined}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <div className="form-error" role="alert">
                Mật khẩu xác nhận chưa khớp.
              </div>
            )}
            {pwdError && (
              <div id="password-form-error" className="form-error" role="alert">
                {pwdError}
              </div>
            )}
            <div className="profile-form-actions">
              <button
                type="button"
                className="soft-button"
                onClick={() => {
                  resetPasswordForm();
                  setShowPasswordForm(false);
                }}
              >
                <X size={15} /> Hủy
              </button>
              <button className="primary-button" disabled={pwdBusy}>
                <KeyRound size={15} />
                {pwdBusy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
