import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import os

# =====================================================================
# 1. KHAI BÁO CUSTOM LAYER (Bỏ decorator để tránh lỗi phiên bản)
# =====================================================================
class AddPositionEmbs(keras.layers.Layer):
    """Learned positional embedding"""
    def __init__(self, num_tokens, embed_dim, **kwargs):
        super().__init__(**kwargs)
        self.num_tokens = num_tokens
        self.embed_dim  = embed_dim
        self.pos_emb    = layers.Embedding(num_tokens, embed_dim, name='pos_emb_table')

    def call(self, x):
        positions = tf.range(start=0, limit=self.num_tokens, delta=1)
        return x + self.pos_emb(positions)

    def get_config(self):
        cfg = super().get_config()
        cfg.update({
            'num_tokens': self.num_tokens,
            'embed_dim':  self.embed_dim
        })
        return cfg


# =====================================================================
# 2. ĐOẠN CODE LOGIC QUÉT VÀ LOAD MODEL
# =====================================================================
MODEL_DIR = r"D:\DAI_HOC_KHOA_HOC_TU_NHIEN\KHOALUAN\Tuan9_1.6-7.6\2026_06_01\Update_Train Simplified PneuNet_3class"

print(f"Đang tìm file model (.h5, .keras) trong: {MODEL_DIR}\n")

model_files = [f for f in os.listdir(MODEL_DIR) if f.endswith(".h5") or f.endswith(".keras")]

if not model_files:
    print("❌ Không tìm thấy file model nào! Kiểm tra lại đường dẫn.")
else:
    print(f"Tìm thấy {len(model_files)} model: {model_files}\n")
    for filename in model_files:
        path = os.path.join(MODEL_DIR, filename)
        print(f"Đang load: {filename} ...")
        try:
            # Khai báo lớp Custom Layer thông qua tham số custom_objects
            model = tf.keras.models.load_model(
                path, 
                custom_objects={'AddPositionEmbs': AddPositionEmbs}
            )
            print(f"   ✅ OK — input: {model.input_shape}, output: {model.output_shape}\n")
        except Exception as e:
            print(f"   ❌ LỖI: {e}\n")