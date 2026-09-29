/*Component này nhận ảnh từ người dùng (kéo thả hoặc click chọn),
 hiển thị preview ngay lập tức, và báo lên cho UploadPage biết file nào được chọn. */

// src/components/ImageUploader.jsx
import { useState, useRef, useCallback } from 'react'

// onImageSelect: hàm callback — gọi khi user chọn xong ảnh
// Nhận vào: File object
function ImageUploader({ onImageSelect, onError }) {
    const [preview, setPreview] = useState(null)   // URL tạm để hiển thị ảnh
    const [isDragging, setIsDragging] = useState(false) // đang kéo file vào?
    const [fileName, setFileName] = useState('')      // tên file để hiển thị
    const fileInputRef = useRef(null) // tham chiếu đến <input type="file"> ẩn

    // Hàm xử lý chung khi có file — dùng useCallback để tránh tạo lại hàm mỗi render
    const handleFile = useCallback((file) => {
        if (!file) return
        if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
            onError?.('Chỉ chấp nhận file JPEG hoặc PNG')   // thay alert()
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            onError?.('File quá lớn. Tối đa 10MB')           // thay alert()
            return
        }

        // URL.createObjectURL: tạo đường dẫn tạm trong trình duyệt
        // Không cần upload lên server — chỉ để preview ngay lập tức
        const previewUrl = URL.createObjectURL(file)
        setPreview(previewUrl)
        setFileName(file.name)

        // Báo lên UploadPage biết có file mới
        onImageSelect(file)
    }, [onImageSelect, onError])

    // Xử lý khi thả file vào vùng drop
    const handleDrop = useCallback((e) => {
        e.preventDefault()              // QUAN TRỌNG: ngăn trình duyệt mở file
        e.stopPropagation()
        setIsDragging(false)

        const file = e.dataTransfer.files[0]  // chỉ lấy file đầu tiên
        handleFile(file)
    }, [handleFile])

    // Khi kéo file vào vùng drop (chưa thả)
    const handleDragOver = useCallback((e) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    // Khi kéo ra ngoài vùng drop
    const handleDragLeave = useCallback((e) => {
        // Chỉ tắt isDragging khi ra khỏi toàn bộ zone
        // (không tắt khi đi qua phần tử con bên trong)
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsDragging(false)
        }
    }, [])

    // Xóa ảnh — cho phép chọn lại
    const handleClear = (e) => {
        e.stopPropagation()  // không trigger click vào zone
        setPreview(null)
        setFileName('')
        onImageSelect(null)
        // Reset input để có thể chọn lại cùng file
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    return (
        <div
            onClick={() => !preview && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
                border: `2px dashed ${isDragging ? 'var(--text-accent)' : preview ? 'var(--border)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                background: isDragging ? 'var(--bg-hover)' : 'var(--bg-card)',
                transition: 'var(--transition)',
                cursor: preview ? 'default' : 'pointer',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '200px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {/* Input ẩn — trigger bằng ref khi click vào zone */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files[0])}
            />

            {preview ? (
                /* ── Đã có ảnh: hiển thị preview ── */
                <div style={{ width: '100%', textAlign: 'center', padding: '12px' }}>
                    <img
                        src={preview}
                        alt="Preview X-ray"
                        style={{
                            maxHeight: '280px',
                            maxWidth: '100%',
                            borderRadius: 'var(--radius-md)',
                            objectFit: 'contain',
                        }}
                    />
                    {/* Thanh thông tin + nút đổi ảnh */}
                    <div style={{
                        marginTop: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                    }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                            📎 {fileName}
                        </span>
                        <button
                            onClick={handleClear}
                            style={{
                                background: 'var(--bg-hover)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-secondary)',
                                padding: '3px 10px',
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                            }}
                        >
                            Đổi ảnh
                        </button>
                    </div>
                </div>
            ) : (
                /* ── Chưa có ảnh: hiển thị hướng dẫn ── */
                <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🩻</div>
                    <p style={{
                        color: isDragging ? 'var(--text-accent)' : 'var(--text-accent)',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        marginBottom: '6px',
                    }}>
                        {isDragging ? 'Thả ảnh vào đây...' : 'Kéo thả ảnh X-ray vào đây'}
                    </p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginBottom: 0 }}>
                        hoặc click để chọn file — JPEG, PNG, tối đa 10MB
                    </p>
                </div>
            )}
        </div>
    )
}

export default ImageUploader