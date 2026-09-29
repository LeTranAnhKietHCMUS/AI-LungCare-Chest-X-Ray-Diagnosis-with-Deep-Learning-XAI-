/* ======================================================================
COMPONENT NAVBAR (THANH ĐIỀU HƯỚNG TRÊN CÙNG)
- Chức năng: Làm bộ khung cố định ở đầu trang web để hiển thị tên ứng dụng.
- Giao diện (Style): Thiết kế theo phong cách Dark Mode công nghệ:
  + Nền màu xanh đen tối (#13161f), có đường kẻ mảnh phân cách ở đáy.
  + Chiều cao cố định 56px, chữ bên trong luôn tự động căn giữa theo chiều dọc.
  + Tên thương hiệu "AI-LungCare" được làm nổi bật bằng màu xanh dương in đậm.
======================================================================
*/
// src/components/Navbar.jsx
import { Link, useLocation } from 'react-router-dom'

// Danh sách các trang trong app
const NAV_LINKS = [
    { to: '/', label: 'Trang chủ' },
    { to: '/upload', label: 'Phân tích' },
    { to: '/history', label: 'Lịch sử' },
    { to: '/about', label: 'Giới thiệu' },
]

function Navbar() {
    const { pathname } = useLocation()  // lấy URL hiện tại

    return (
        <nav style={{
            background: '#13161f',
            borderBottom: '1px solid var(--border)',
            padding: '0 32px',
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            gap: '0',
            // Dính vào trên cùng khi scroll
            position: 'sticky',
            top: 0,
            zIndex: 100,
        }}>
            {/* Logo */}
            <span style={{
                color: 'var(--text-accent)',
                fontWeight: 700,
                fontSize: '1.05rem',
                marginRight: '32px',
                letterSpacing: '-0.3px',
            }}>
                🫁 AI-LungCare
            </span>

            {/* Các link điều hướng */}
            {NAV_LINKS.map(({ to, label }) => {
                const isActive = pathname === to

                return (
                    // Link từ react-router-dom — không reload trang khi click
                    <Link
                        key={to}
                        to={to}
                        style={{
                            color: isActive ? 'var(--text-accent)' : 'var(--text-secondary)',
                            textDecoration: 'none',
                            fontSize: '0.88rem',
                            padding: '0 14px',
                            height: '56px',
                            display: 'flex',
                            alignItems: 'center',
                            // Viền dưới màu accent khi active, trong suốt khi không
                            borderBottom: isActive
                                ? '2px solid var(--text-accent)'
                                : '2px solid transparent',
                            fontWeight: isActive ? 600 : 400,
                            transition: 'var(--transition)',
                        }}
                    >
                        {label}
                    </Link>
                )
            })}
        </nav>
    )
}

export default Navbar