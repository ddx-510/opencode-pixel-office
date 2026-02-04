from PIL import Image
import sys

def get_unique_colors(image_path):
    try:
        img = Image.open(image_path)
        img = img.convert("RGB")
        colors = img.getcolors(maxcolors=1000000)
        
        # Sort by count descending
        colors.sort(key=lambda x: x[0], reverse=True)
        
        unique_hexes = []
        seen = set()
        
        print("Extracted Colors:")
        for count, color in colors:
            hex_val = "#{:02x}{:02x}{:02x}".format(color[0], color[1], color[2])
            if hex_val not in seen:
                # Filter out very small nuances if needed, but for a palette image, 
                # we assume distinct blocks.
                # Let's filter out very rare pixels (antialiasing artifacts)
                if count > 100: 
                    unique_hexes.append(hex_val)
                    seen.add(hex_val)
                    print(f"{hex_val} (count: {count})")
        
        return unique_hexes

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_colors.py <image_path>")
    else:
        get_unique_colors(sys.argv[1])
