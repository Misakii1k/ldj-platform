import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

SHEET_PATH = r"C:\Users\87850\.gemini\antigravity\brain\000a5de9-3625-46f8-8228-425d7498996e\game_icons_sheet_1786865464795.jpg"
OUT_DIR = Path(r"d:\项目\packages\client\public\assets\icons")

ICON_NAMES = [
    "crown",      "farmer",     "trophy",     "bomb",
    "rocket",     "horn",       "hourglass",  "pointer",
    "sound_on",   "sound_off",  "door_exit",  "cards_deck",
    "werewolf",   "undercover", "robot",      "star",
]

def remove_grey_background(arr_rgba, thresh=22):
    r = arr_rgba[:, :, 0].astype(int)
    g = arr_rgba[:, :, 1].astype(int)
    b = arr_rgba[:, :, 2].astype(int)
    
    diff_rg = np.abs(r - g)
    diff_rb = np.abs(r - b)
    diff_gb = np.abs(g - b)
    is_neutral = (diff_rg < thresh) & (diff_rb < thresh) & (diff_gb < thresh)
    is_midgrey = (r > 80) & (r < 185)
    bg_mask = is_neutral & is_midgrey

    h, w, _ = arr_rgba.shape
    border_mask = np.zeros((h, w), dtype=bool)
    border_mask[0, :] = True
    border_mask[-1, :] = True
    border_mask[:, 0] = True
    border_mask[:, -1] = True
    
    labeled, num_features = ndimage.label(bg_mask)
    edge_labels = np.unique(labeled[border_mask])
    edge_labels = edge_labels[edge_labels > 0]
    
    true_bg = np.isin(labeled, edge_labels)
    
    # Soft edge feathering
    dist = ndimage.distance_transform_edt(~true_bg)
    alpha = np.clip(dist * 255.0 / 2.0, 0, 255).astype(np.uint8)
    
    arr_rgba[:, :, 3] = alpha
    return arr_rgba

def clean_connected_components(alpha_channel, min_size_ratio=0.03):
    binary = alpha_channel > 20
    labeled, num_features = ndimage.label(binary)
    if num_features <= 1:
        return alpha_channel
        
    sizes = ndimage.sum(binary, labeled, range(1, num_features + 1))
    max_size = max(sizes)
    
    # Keep components that are significant
    keep_labels = [i + 1 for i, s in enumerate(sizes) if s >= max_size * min_size_ratio]
    keep_mask = np.isin(labeled, keep_labels)
    
    cleaned_alpha = np.where(keep_mask, alpha_channel, 0).astype(np.uint8)
    return cleaned_alpha

def slice_all_icons():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.open(SHEET_PATH).convert("RGBA")
    W, H = img.size
    cell_w = W // 4
    cell_h = H // 4

    print(f"Slicing 16 Game Icons from {SHEET_PATH} ({W}x{H})...")
    for r in range(4):
        for c in range(4):
            idx = r * 4 + c
            name = ICON_NAMES[idx]
            
            x0 = c * cell_w
            y0 = r * cell_h
            x1 = x0 + cell_w
            y1 = y0 + cell_h
            
            cell = img.crop((x0, y0, x1, y1))
            arr = np.array(cell)
            arr = remove_grey_background(arr, thresh=24)
            arr[:, :, 3] = clean_connected_components(arr[:, :, 3])
            
            out_img = Image.fromarray(arr)
            bbox = out_img.getbbox()
            if bbox:
                pad = 4
                bx0 = max(0, bbox[0] - pad)
                by0 = max(0, bbox[1] - pad)
                bx1 = min(out_img.width, bbox[2] + pad)
                by1 = min(out_img.height, bbox[3] + pad)
                out_img = out_img.crop((bx0, by0, bx1, by1))
                
            dest = OUT_DIR / f"{name}.png"
            out_img.save(dest, "PNG")
            print(f"  [OK] {name}.png ({out_img.width}x{out_img.height})")

if __name__ == "__main__":
    slice_all_icons()
