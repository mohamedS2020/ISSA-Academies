"""
Generate the sport marks in public/sports/<key>/ (logo.svg 64 px, favicon.svg 32 px).

    python3 scripts/sport-marks.py

One recipe for every sport, so the set reads as one family:
  - a flat tile in the sport theme's primary colour (no gradients);
  - a white athlete pictogram with tapered limbs (thick at the body, thin at
    hands and feet), so it reads as a person down to 16 px;
  - one element of the sport's setting in the theme's accent colour: the
    beam, the water, the pitch line, the court line.
The favicon is the same drawing at half scale.

Adding a sport: a pose function below (64-unit grid; P(x, y) scales a point)
and an entry in SPORTS with the colours its theme uses in globals.css or
brand-tokens.css. Render the result at 16, 32 and 64 px before committing: a
pose that reads at 64 px can turn into a letter at 16 (an early gymnastics
handstand read as a Y, too close to the Yallacademy mark).
"""
import math

def limb(a, b, wa, wb, fill=None):
    (x1,y1),(x2,y2)=a,b
    dx,dy=x2-x1,y2-y1; L=math.hypot(dx,dy); nx,ny=-dy/L,dx/L
    ra,rb=wa/2,wb/2
    pts=[(x1+nx*ra,y1+ny*ra),(x2+nx*rb,y2+ny*rb),(x2-nx*rb,y2-ny*rb),(x1-nx*ra,y1-ny*ra)]
    f=' '.join(f'{x:.2f},{y:.2f}' for x,y in pts)
    fa=f' fill="{fill}"' if fill else ''
    return (f'<polygon points="{f}"{fa}/>'
            f'<circle cx="{x1:.2f}" cy="{y1:.2f}" r="{ra:.2f}"{fa}/><circle cx="{x2:.2f}" cy="{y2:.2f}" r="{rb:.2f}"{fa}/>')

def circle(c, r, fill=None):
    fa=f' fill="{fill}"' if fill else ''
    return f'<circle cx="{c[0]:.2f}" cy="{c[1]:.2f}" r="{r:.2f}"{fa}/>'

# ── Poses ───────────────────────────────────────────────────────
def gymnastics(s, C):
    P=lambda x,y:(x*s,y*s)
    under=f'<rect x="{9*s}" y="{50*s}" width="{46*s}" height="{5*s}" rx="{2.5*s}" fill="{C["ground"]}"/>'
    hip=P(31,33); sh=P(28.5,20.5)
    fig=''.join([
      limb(hip,P(56,25),6.2*s,2.2*s), limb(hip,P(8,37),6.2*s,2.2*s),
      limb(hip,sh,7.0*s,7.6*s),
      limb(P(29.5,21.5),P(43,10.5),3.4*s,2.0*s), limb(P(28,22.5),P(16,24),3.4*s,2.0*s),
      circle(P(26.6,12.4),4.4*s)])
    return under, fig, ''

def swimming(s, C):
    # Freestyle: body along the water, one arm recovering over it, head turned to breathe.
    P=lambda x,y:(x*s,y*s)
    hip=P(40,37); sh=P(23,35)
    fig=''.join([
      limb(sh,hip,7.4*s,6.6*s),                    # torso, horizontal
      limb(hip,P(57,35),5.6*s,2.4*s),              # legs, kicking
      limb(P(24,34),P(34,21),3.6*s,2.8*s),         # upper arm, recovering
      limb(P(34,21),P(47,25),2.8*s,2.0*s),         # forearm, reaching forward
      limb(P(22,36),P(8,38),3.4*s,2.0*s),          # leading arm, in the water
      circle(P(17,30),4.4*s)])                     # head, turned
    # Water over the lower half of the swimmer.
    w=(f'<path d="M0 {40*s} q{8*s} {-5*s} {16*s} 0 t{16*s} 0 t{16*s} 0 t{16*s} 0 V{64*s} H0 Z" fill="{C["ground"]}"/>')
    return '', fig, w

def football(s, C):
    # A kick: standing leg planted, kicking leg through the ball, arms out.
    P=lambda x,y:(x*s,y*s)
    hip=P(30,34); sh=P(26,21)
    under=f'<rect x="{6*s}" y="{53*s}" width="{52*s}" height="{3*s}" rx="{1.5*s}" fill="{C["ground"]}"/>'
    fig=''.join([
      limb(hip,P(27,44),6.4*s,4.6*s), limb(P(27,44),P(22,53),4.6*s,2.8*s),   # standing leg, knee bent
      limb(hip,P(40,40),6.2*s,4.2*s), limb(P(40,40),P(46,48),4.2*s,2.6*s),   # kicking leg
      limb(hip,sh,7.0*s,7.6*s),                                             # torso, leaning back
      limb(P(27,22),P(40,19),3.4*s,2.0*s),                                  # front arm
      limb(P(25,23),P(13,28),3.4*s,2.0*s),                                  # back arm
      circle(P(24.5,13),4.4*s)])
    ball=circle(P(52.5,48.5),5.2*s,'#FFFFFF')+circle(P(52.5,48.5),1.9*s,C["tile"])
    return under, fig, ball

def padel(s, C):
    # An overhead smash: paddle up, the ball just above it.
    P=lambda x,y:(x*s,y*s)
    hip=P(30,37); sh=P(31,24)
    under=f'<rect x="{6*s}" y="{55*s}" width="{52*s}" height="{3*s}" rx="{1.5*s}" fill="{C["ground"]}"/>'
    fig=''.join([
      limb(hip,P(23,46),6.4*s,4.4*s), limb(P(23,46),P(19,55),4.4*s,2.6*s),   # back leg
      limb(hip,P(38,46),6.2*s,4.4*s), limb(P(38,46),P(41,55),4.4*s,2.6*s),   # front leg
      limb(hip,sh,7.0*s,7.6*s),
      limb(P(32,24),P(40,15),3.4*s,2.6*s),                                  # hitting arm, up
      limb(P(30,25.5),P(20,30),3.4*s,2.0*s),                                # other arm
      circle(P(28,16),4.4*s)])
    # The paddle: a solid oval head on a short handle, in line with the arm.
    paddle=(limb(P(40,15),P(43,12),2.6*s,2.2*s,'#FFFFFF')
            + f'<ellipse cx="{46.8*s:.2f}" cy="{8.6*s:.2f}" rx="{4.8*s:.2f}" ry="{5.6*s:.2f}" transform="rotate(42 {46.8*s:.2f} {8.6*s:.2f})" fill="#FFFFFF"/>')
    ball=circle(P(55.5,17),2.8*s,C["ground"])
    return under, fig, paddle+ball

SPORTS={
  'gymnastics': dict(pose=gymnastics, tile='#A3153F', ground='#E0BC8A',
     about="a split leap over the balance beam. Carmine (a competition leotard), chalk white, the beam's suede; the ya-gym tokens in src/styles/brand-tokens.css."),
  'swimming': dict(pose=swimming, tile='#005F73', ground='#84C9CA',
     about="freestyle, the arm recovering over the water. Deep Sea and Lagoon-300, the Yallacademy colours the swimming theme uses."),
  'football': dict(pose=football, tile='#157F3C', ground='#E7B008',
     about="a kick through the ball on the pitch line. The football theme's green and gold (globals.css)."),
  'padel': dict(pose=padel, tile='#853AEE', ground='#10BC83',
     about="an overhead smash, paddle up. The padel theme's violet and emerald (globals.css)."),
}

def svg(key, size):
    C=SPORTS[key]; s=size/64; rx=14*s
    under, fig, over = C['pose'](s, C)
    title=key.capitalize()
    note=(f"{title} mark: {C['about']}" if size==64 else f"The {key} mark at half scale, for 16 to 32 px.")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
  <title>{title}</title>
  <!-- {note} Generated: flat colours, tapered limbs, no gradients. -->
  <defs><clipPath id="tile"><rect width="{size}" height="{size}" rx="{rx:g}"/></clipPath></defs>
  <g clip-path="url(#tile)">
    <rect width="{size}" height="{size}" fill="{C['tile']}"/>
    {under}
    <g fill="#FFFFFF">{fig}</g>
    {over}
  </g>
</svg>
'''

import os
base=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'sports') + os.sep
for key in SPORTS:
    open(f'{base}{key}/logo.svg','w').write(svg(key,64))
    open(f'{base}{key}/favicon.svg','w').write(svg(key,32))
