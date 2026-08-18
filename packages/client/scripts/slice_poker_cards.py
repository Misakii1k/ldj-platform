import sys
from pathlib import Path
from PIL import Image
import numpy as np

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

def slice_sheet(sheet_path: str, out_dir: str):
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    img = Image.open(sheet_path).convert("RGBA")
    w, h = img.size
    print(f"Sheet size: {w}x{h}")

    cw = w // 4
    ch = h // 4

    for r in range(4):
        for c in range(4):
            idx = r * 4 + c
            name = CARD_NAMES[idx]
            
            x0 = c * cw
            y0 = r * ch
            x1 = x0 + cw
            y1 = y0 + ch

            # Crop the cell
            cell = img.crop((x0, y0, x1, y1))
            
            # Convert to numpy for background removal
            arr = np.array(cell)
            rgb = arr[:, :, :3]
            
            if name == "card_back":
                # For card back (which is a rectangular card itself), crop closely to the card border
                # Detect the grey background around the card
                # Grey background has low saturation and around 120-140 brightness
                r_ch, g_ch, b_ch = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
                grey_mask = (np.abs(r_ch - g_ch) < 15) & (np.abs(g_ch - b_ch) < 15) & (r_ch > 105) & (r_ch < 155)
                alpha = np.where(grey_mask, 0, 255).astype(np.uint8)
                arr[:, :, 3] = alpha
            else:
                # Find grey background pixels: R, G, B all close to each other and around 128
                # Also remove the corner letters if needed, or keep the character centered
                r_ch, g_ch, b_ch = rgb[:, :, 0].astype(int), rgb[:, :, 1].astype(int), rgb[:, :, 2].astype(int)
                is_grey = (np.abs(r_ch - g_ch) < 18) & (np.abs(g_ch - b_ch) < 18) & (np.abs(r_ch - b_ch) < 18) & (r_ch > 105) & (r_ch < 150)
                
                alpha = np.where(is_grey, 0, 255).astype(np.uint8)
                arr[:, :, 3] = alpha

            out_img = Image.fromarray(arr)

            # Auto crop bounding box of non-transparent pixels with padding
            bbox = out_img.getbbox()
            if bbox:
                # Add small padding
                pad = 4
                bx0 = max(0, bbox[0] - pad)
                by0 = max(0, bbox[1] - pad)
                bx1 = min(out_img.width, bbox[2] + pad)
                by1 = min(out_img.height, bbox[3] + pad)
                out_img = out_img.crop((bx0, by0, bx1, by1))

            target_file = out_path / f"{name}.png"
            out_img.save(target_file, "PNG")
            print(f"Saved {name}.png ({out_img.size[0]}x{out_img.size[1]})")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: py slice_poker_cards.py <sheet_path> <out_dir>")
        sys.exit(1)
    slice_sheet(sys.argv[1], sys.argv[2])
