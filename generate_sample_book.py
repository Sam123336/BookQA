from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

path = r'c:\Users\susan\.gemini\antigravity\scratch\bookqa\sample-book.pdf'

c = canvas.Canvas(path, pagesize=letter)

c.setTitle('The Garden of Quiet Ideas')
c.setAuthor('Sample Author')

c.setFont('Helvetica-Bold', 18)
c.drawString(72, 720, 'The Garden of Quiet Ideas')

lines = [
    'Chapter 1. The old oak stood near the village path, and every morning the children met there to listen to the wind.',
    'The gardener explained that patience was the seed of wisdom, and that learning began with careful observation.',
    'By noon the path was warm and the town square hummed with activity, yet the garden remained still and thoughtful.',
    'Chapter 2. The keeper of the orchard taught that every fruit held a lesson about timing and care.',
    'A small lamp burned on the windowsill each evening, reminding the family that hope grows best in quiet attention.',
    'When rain arrived, it softened the soil and renewed the roots beneath the earth.',
    'Chapter 3. In the final chapter, the villagers gathered to share stories and gratitude.',
    'They learned that a healthy community grows through listening, generosity, and steady work.',
    'The garden became a place where neighbors rested, reflected, and remembered what mattered most.'
]

c.setFont('Helvetica', 12)
y = 680
for line in lines:
    if y < 72:
        c.showPage()
        y = 760
    c.drawString(72, y, line)
    y -= 22

c.save()
print(path)
