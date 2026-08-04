# Logos de Notoria, 1024x1024 PNG.
#
# Historial de la exploracion, para no repetir caminos ya descartados:
#   - Estrella, escudo, pin: descartados. Es el iconito que usa todo el rubro,
#     y la estrella partida en dos colores lee como emblema politico.
#   - Chevron/"cima": es un icono de flecha generico, sin identidad.
#   - Medidor de arco: lee como spinner de carga, no como marca.
# Queda la N asimetrica: geometria plana, sin trazos redondeados, con el asta
# derecha mas alta que la izquierda y cortada en bisel EN SENTIDO CONTRARIO a la
# diagonal. Ese bisel es toda la identidad — una N simetrica es un monograma
# cualquiera. El asta que asciende dice "la reputacion sube" sin dibujar flechas.
#
# No hay rasterizador SVG en la maquina: se dibuja con Pillow, que no antialiasa
# poligonos, asi que se renderiza a 4x y se reduce con LANCZOS.

import os
from PIL import Image, ImageDraw

VERDE  = (11, 115, 36)     # #0B7324
OSCURO = (20, 20, 19)      # #141413
CREMA  = (250, 249, 245)   # #FAF9F5

LADO, ESCALA = 1024, 4
S = LADO * ESCALA
SALIDA = os.path.dirname(os.path.abspath(__file__))

# La N en coordenadas normalizadas (0..1 en ancho y alto de su propia caja).
# Se define una sola vez para que la version suelta y la de teja sean
# exactamente la misma letra y la familia no se desalinee.
PROPORCION = 0.879          # ancho / alto
_XLI, _XLD, _XRI, _XRD = 0.0, 0.245, 0.755, 1.0
_TAPA_IZQ, _BASE, _TAPA_DER, _BISEL = 0.198, 1.0, 0.0, 0.220


def dibujar_n(draw, cx, cy, alto, color):
    a = alto
    an = alto * PROPORCION
    x0, y0 = cx - an / 2, cy - a / 2
    X = lambda u: x0 + u * an
    Y = lambda v: y0 + v * a

    # Asta izquierda
    draw.polygon([(X(_XLI), Y(_TAPA_IZQ)), (X(_XLD), Y(_TAPA_IZQ)),
                  (X(_XLD), Y(_BASE)),     (X(_XLI), Y(_BASE))], fill=color)
    # Diagonal
    draw.polygon([(X(_XLI), Y(_TAPA_IZQ)), (X(_XLD), Y(_TAPA_IZQ)),
                  (X(_XRD), Y(_BASE)),     (X(_XRI), Y(_BASE))], fill=color)
    # Asta derecha: sube mas y se corta en bisel
    draw.polygon([(X(_XRI), Y(_BASE)),  (X(_XRI), Y(_BISEL)),
                  (X(_XRD), Y(_TAPA_DER)), (X(_XRD), Y(_BASE))], fill=color)


def guardar(img, nombre):
    img.resize((LADO, LADO), Image.LANCZOS).save(
        os.path.join(SALIDA, nombre), 'PNG', optimize=True)
    print(f'  {nombre}  {os.path.getsize(os.path.join(SALIDA, nombre))/1024:.1f} KB')


def marca_suelta(fondo, tinta, nombre):
    """El simbolo sobre fondo plano. Es la version para el sitio y el favicon."""
    img = Image.new('RGB', (S, S), fondo)
    dibujar_n(ImageDraw.Draw(img), S / 2, S / 2, 0.560 * S, tinta)
    guardar(img, nombre)


def marca_teja(fondo, teja, hueco, nombre):
    """Version app-icon: la teja es la tinta y la N es el hueco. Aguanta mejor
    los tamanos chicos porque la silueta exterior nunca se pierde."""
    img = Image.new('RGB', (S, S), fondo)
    d = ImageDraw.Draw(img)
    m = 0.075 * S
    d.rounded_rectangle([m, m, S - m, S - m], radius=0.225 * S, fill=teja)
    dibujar_n(d, S / 2, S / 2, 0.430 * S, hueco)
    guardar(img, nombre)


def tira_legibilidad(fondo, tinta, nombre):
    """Prueba de fuego: la marca a 16, 24, 32 y 64 px. Si a 16 no se lee como N,
    no sirve como favicon y hay que engordar los trazos."""
    tamanos = [16, 24, 32, 64, 128]
    pad, sep = 40, 40
    ancho = pad * 2 + sum(tamanos) + sep * (len(tamanos) - 1)
    alto = pad * 2 + max(tamanos)
    tira = Image.new('RGB', (ancho, alto), fondo)

    x = pad
    for t in tamanos:
        chip = Image.new('RGB', (t * 8, t * 8), fondo)
        dibujar_n(ImageDraw.Draw(chip), t * 4, t * 4, 0.560 * t * 8, tinta)
        tira.paste(chip.resize((t, t), Image.LANCZOS), (x, pad + (max(tamanos) - t) // 2))
        x += t + sep

    tira.save(os.path.join(SALIDA, nombre), 'PNG', optimize=True)
    print(f'  {nombre}  ({ancho}x{alto}, prueba de tamanos)')


print('\nMarca suelta')
marca_suelta(OSCURO, VERDE, 'notoria-marca-oscuro.png')
marca_suelta(CREMA,  VERDE, 'notoria-marca-claro.png')
marca_suelta(VERDE,  CREMA, 'notoria-marca-verde.png')

print('\nTeja (app icon)')
marca_teja(OSCURO, VERDE,  OSCURO, 'notoria-teja-verde.png')
marca_teja(CREMA,  OSCURO, CREMA,  'notoria-teja-oscura.png')

print('\nLegibilidad')
tira_legibilidad(OSCURO, VERDE, 'notoria-prueba-tamanos.png')

print(f'\n1024x1024 PNG en {SALIDA}\n')
