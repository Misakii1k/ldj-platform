import sys
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

CARDS_SHEET = r"C:\Users\87850\.gemini\antigravity\brain\000a5de9-3625-46f8-8228-425d7498996e\poker_cards_sheet_1786864499631.jpg"
SUITS_SHEET = r"C:\Users\87850\.gemini\antigravity\brain\000a5de9-3625-46f8-8228-425d7498996e\poker_suits_sheet_1786864657438.jpg"
OUT_DIR = r"d:\项目\packages\client\public\assets\cards"

CARD_NAMES = [
    # Row 0
    "joker_big",       # 0,0
    "joker_small",     # 0,1
    "king_spades",     # 0,2
    "queen_spades",    # 0,3
    # Row 1
    "jack_spades",     # 1,0
    "king_hearts",     # 1,1
    "queen_hearts",    # 1,2
    "jack_hearts",     # 1,3
    # Row 2
    "king_clubs",      # 2,0
    "queen_clubs",     # 2,1
    "jack_clubs",      # 2,2
    "king_diamonds",   # 2,3
    # Row 3
    "queen_diamonds",  # 3,0
    "jack_diamonds",   # 3,1
    "ace_spades",      # 3,2
    "card_back",       # 3,3
]

SUIT_NAMES = [
    "suit_spades",     # 0,0
    "suit_hearts",     # 0,1
    "suit_clubs",      # 1,0
    "suit_diamonds",   # 1,1
]

def remove_grey_background(arr, thresh=22, bg_target=(128, 128, 128)):
    """Convert pixels close to neutral grey into transparent."""
    rgb = arr[:, :, :3].astype(float)
    bg = np.array(bg_target, dtype=float)
    
    # Check neutral grey: difference between channels is small, and brightness is near bg_target
    diff_inter = np.max(np.abs(rgb[:, :, :3] - np.mean(rgb[:, :, :3], axis=2, keepdims=True)), axis=2)
    dist_bg = np.max(np.abs(rgb - bg), axis=2)
    
    # A pixel is grey background if color saturation is low and near grey range (90-160)
    is_bg = (diff_inter < 12) & (dist_bg < thresh)
    
    alpha = np.where(is_bg, 0, 255).astype(np.uint8)
    out = arr.copy()
    out[:, :, 3] = alpha
    return out

def clean_connected_components(alpha, keep_center_only=True):
    """Keep the main central component and close parts, drop corner text/artifacts."""
    mask = alpha > 40
    if not mask.any():
        return alpha
        
    labels, n = ndimage.label(mask)
    if n <= 1:
        return alpha
        
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    
    h, w = mask.shape
    cx, cy = w / 2.0, h / 2.0
    
    coms = ndimage.center_of_mass(mask, labels, range(1, n + 1))
    
    # Candidate components that are reasonably large and not strictly in the far top-left corner
    main_candidates = []
    for l in range(1, n + 1):
        cy_l, cx_l = coms[l - 1]
        # Ignore tiny components in the top-left 25% (which were corner index labels)
        if cx_l < w * 0.28 and cy_l < h * 0.28 and sizes[l] < sizes.max() * 0.2:
            continue
        main_candidates.append(l)
        
    if not main_candidates:
        main_candidates = [int(np.argmax(sizes))]
        
    main = max(main_candidates, key=lambda l: sizes[l])
    
    # Keep main component and any component attached/near to it (gap < 8% dimension)
    slices = ndimage.find_objects(labels)
    mb = slices[main - 1]
    link = 0.08 * max(h, w)
    min_area = 0.015 * sizes[main]
    
    keep = {main}
    for l in range(1, n + 1):
        if l == main or sizes[l] < min_area:
            continue
        cy_l, cx_l = coms[l - 1]
        if cx_l < w * 0.25 and cy_l < h * 0.25 and sizes[l] < sizes[main] * 0.15:
            continue  # Drop corner text
            
        b = slices[l - 1]
        dy = max(0, b[0].start - mb[0].stop, mb[0].start - b[0].stop)
        dx = max(0, b[1].start - mb[1].stop, mb[1].start - b[1].stop)
        if dy <= link and dx <= link:
            keep.add(l)
            
    out_alpha = alpha.copy()
    out_alpha[~np.isin(labels, list(keep))] = 0
    return out_alpha

def process_cards():
    out_path = Path(OUT_DIR)
    out_path.mkdir(parents=True, exist_ok=True)
    
    # 1. Process 4x4 Cards Sheet
    cards_img = Image.open(CARDS_SHEET).convert("RGBA")
    W, H = cards_img.size
    cw, ch = W // 4, H // 4
    
    print(f"Processing Cards Sheet ({W}x{H})...")
    for r in range(4):
        for c in range(4):
            idx = r * 4 + c
            name = CARD_NAMES[idx]
            
            x0, y0 = c * cw, r * ch
            x1, y1 = x0 + cw, y0 + ch
            
            cell = cards_img.crop((x0, y0, x1, y1))
            arr = np.array(cell)
            
            if name == "card_back":
                # For card back, it's a full rectangular card. Clean outer grey background
                arr = remove_grey_background(arr, thresh=24)
            else:
                arr = remove_grey_background(arr, thresh=20)
                arr[:, :, 3] = clean_connected_components(arr[:, :, 3])
                
            img_out = Image.fromarray(arr)
            bbox = img_out.getbbox()
            if bbox:
                pad = 4
                bx0 = max(0, bbox[0] - pad)
                by0 = max(0, bbox[1] - pad)
                bx1 = min(img_out.width, bbox[2] + pad)
                by1 = min(img_out.height, bbox[3] + pad)
                img_out = img_out.crop((bx0, by0, bx1, by1))
                
            save_dest = out_path / f"{name}.png"
            img_out.save(save_dest, "PNG")
            print(f"  [OK] {name}.png ({img_out.size[0]}x{img_out.size[1]})")

    # 2. Process 2x2 Suits Sheet
    suits_img = Image.open(SUITS_SHEET).convert("RGBA")
    SW, SH = suits_img.size
    scw, sch = SW // 2, SH // 2
    
    print(f"\nProcessing Suits Sheet ({SW}x{SH})...")
    for r in range(2):
        for c in range(2):
            idx = r * 2 + c
            name = SUIT_NAMES[idx]
            
            x0, y0 = c * scw, r * sch
            x1, y1 = x0 + scw, y0 + sch
            
            cell = suits_img.crop((x0, y0, x1, y1))
            arr = np.array(cell)
            arr = remove_grey_background(arr, thresh=26)
            arr[:, :, 3] = clean_connected_components(arr[:, :, 3])
            
            img_out = Image.fromarray(arr)
            bbox = img_out.getbbox()
            if bbox:
                pad = 4
                bx0 = max(0, bbox[0] - pad)
                by0 = max(0, bbox[1] - pad)
                bx1 = min(img_out.width, bbox[2] + pad)
                by1 = min(img_out.height, bbox[3] + pad)
                img_out = img_out.crop((bx0, by0, bx1, by1))
                
            save_dest = out_path / f"{name}.png"
            img_out.save(save_dest, "PNG")
            print(f"  [OK] {name}.png ({img_out.size[0]}x{img_out.size[1]})")

if __name__ == "__main__":
    process_cards()
