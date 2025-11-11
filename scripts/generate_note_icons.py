from PIL import Image, ImageDraw, ImageFont
import os

size = (512, 512)
color = (10, 10, 10)
background = (255, 255, 255, 0)

font = ImageFont.truetype("Arial.ttf", 400)

symbols = {
    'whole': '𝅝',
    'half': '𝅗𝅥',
    'dotted-half': '𝅗𝅥.',
    'quarter': '♩',
    'dotted-quarter': '♩.',
    'eighth': '♪',
    'dotted-eighth': '♪.',
    'triplet-eighth': '♬',
    'sixteenth': '♬'
}

def main():
    out_dir = os.path.join('static', 'icons', 'notes')
    os.makedirs(out_dir, exist_ok=True)
    for name, char in symbols.items():
        img = Image.new('RGBA', size, background)
        draw = ImageDraw.Draw(img)
        w, h = draw.textsize(char, font=font)
        draw.text(((size[0]-w)/2, (size[1]-h)/2), char, fill=color, font=font)
        img.save(os.path.join(out_dir, f"{name}.png"))

if __name__ == '__main__':
    main()
