import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Every icon here is transliterated 1:1 from the inline SVG paths already
 * drawn (and approved) on the Amora Claude Design canvas — same `d` data,
 * same 0-24 viewBox — so the app renders pixel-identical icons to the
 * mockups rather than a redrawn approximation.
 *
 * Two near-duplicate person icons existed on the canvas (the Profile tab's
 * and the "Solo" toggle's differed by a rounding error); this list keeps
 * just one (`person`) and reuses it in both places.
 */
export type IconName =
  | 'heart'
  | 'heartOutline'
  | 'check'
  | 'sparkle'
  | 'sparkleDouble'
  | 'home'
  | 'homeFilled'
  | 'gallery'
  | 'galleryFilled'
  | 'person'
  | 'personFilled'
  | 'couple'
  | 'chevronLeft'
  | 'chevronRight'
  | 'plus'
  | 'close'
  | 'lock'
  | 'crown'
  | 'camera'
  | 'wallpaper'
  | 'share'
  | 'download'
  | 'eye'
  | 'noWatermark'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'shield'
  | 'bell'
  | 'globe'
  | 'help'
  | 'logout'
  | 'mail'
  | 'shuffle'
  | 'tip'
  | 'filter'
  | 'styleRealistic'
  | 'styleNeon'
  | 'styleCartoon'
  | 'styleAnime'
  | 'styleCyberpunk'
  | 'styleWatercolor'
  | 'style3d'
  | 'styleVintage';

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 20, color = '#fff2ef', strokeWidth = 1.8 }: IconProps) {
  const stroke = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(() => {
        switch (name) {
          case 'heart':
            return (
              <Path
                d="M12 21s-7-4.6-9.5-9.2C.7 8 3 4.5 6.4 4.5c2 0 3.6 1.1 4.7 2.9a1 1 0 0 0 1.8 0c1.1-1.8 2.7-2.9 4.7-2.9 3.4 0 5.7 3.5 3.9 7.3C19 16.4 12 21 12 21z"
                fill={color}
              />
            );
          case 'heartOutline':
            return (
              <Path
                d="M12 21s-7-4.6-9.5-9.2C.7 8 3 4.5 6.4 4.5c2 0 3.6 1.1 4.7 2.9a1 1 0 0 0 1.8 0c1.1-1.8 2.7-2.9 4.7-2.9 3.4 0 5.7 3.5 3.9 7.3C19 16.4 12 21 12 21z"
                {...stroke}
              />
            );
          case 'check':
            return <Path d="M5 13l4 4L19 7" {...stroke} />;
          case 'sparkle':
            return <Path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" fill={color} />;
          case 'sparkleDouble':
            return (
              <>
                <Path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" fill={color} />
                <Path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill={color} />
              </>
            );
          case 'home':
            return (
              <Path
                d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
                stroke={color}
                strokeWidth={2.2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          case 'homeFilled':
            return <Path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill={color} />;
          case 'gallery':
            return (
              <>
                <Rect x={3} y={3} width={18} height={18} rx={4} stroke={color} strokeWidth={2.2} fill="none" />
                <Path d="M7 16l4-5 3 3.5 3-3.5 3 4" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx={8.5} cy={8.5} r={1.5} fill={color} />
              </>
            );
          case 'galleryFilled':
            // This path is two subpaths meant to overlap into a rounded
            // frame with a mountain-shaped CUTOUT (the classic Material
            // "image" glyph) — that only reads correctly under the
            // evenodd fill rule; SVG/react-native-svg's default `nonzero`
            // just unions both into one solid blob with no visible cutout
            // at all. Confirmed live (2026-09-07) on the Gallery tab: with
            // no `fillRule`, this rendered as a plain white square with
            // zero picture-icon detail.
            return (
              <Path
                d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5.5 12-2.5-3-3 4h11l-3.5-5z"
                fill={color}
                fillRule="evenodd"
              />
            );
          case 'person':
            return (
              <>
                <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={2.2} fill="none" />
                <Path d="M4 20c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
              </>
            );
          case 'personFilled':
            return (
              <Path
                d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z"
                fill={color}
              />
            );
          case 'couple':
            return (
              <>
                <Circle cx={8.5} cy={8} r={3.2} stroke={color} strokeWidth={2} fill="none" />
                <Circle cx={16} cy={9.5} r={2.6} stroke={color} strokeWidth={2} fill="none" />
                <Path d="M3.5 19c0-3 2.5-5 5-5s5 2 5 5" stroke={color} strokeWidth={2} fill="none" />
                <Path d="M13.5 19c.2-2.2 1.7-3.8 3.7-3.8 2.3 0 4.2 1.9 4.3 4.3" stroke={color} strokeWidth={2} fill="none" />
              </>
            );
          case 'chevronLeft':
            return <Path d="M15 5l-7 7 7 7" {...stroke} />;
          case 'chevronRight':
            return <Path d="M9 6l6 6-6 6" {...stroke} />;
          case 'plus':
            return <Path d="M12 5v14M5 12h14" {...stroke} />;
          case 'close':
            return <Path d="M6 6l12 12M18 6L6 18" {...stroke} />;
          case 'lock':
            return (
              <>
                <Rect x={6} y={10} width={12} height={9} rx={2} {...stroke} />
                <Path d="M9 10V7a3 3 0 0 1 6 0v3" {...stroke} />
              </>
            );
          case 'crown':
            return <Path d="M4 18h16M4 18l-1.2-8.5L7 12l5-7 5 7 4.2-2.5L20 18" {...stroke} />;
          case 'camera':
            return (
              <>
                <Rect x={3} y={7} width={18} height={13} rx={2} {...stroke} />
                <Path d="M8 7l1.5-2.5h5L16 7" {...stroke} />
                <Circle cx={12} cy={13.5} r={3.3} {...stroke} />
              </>
            );
          case 'wallpaper':
            return (
              <>
                <Rect x={3} y={4} width={18} height={14} rx={2} {...stroke} />
                <Path d="M3 15l5-5 4 4 3-3 6 6" {...stroke} />
              </>
            );
          case 'share':
            return (
              <>
                <Circle cx={6} cy={12} r={2.4} {...stroke} />
                <Circle cx={18} cy={6} r={2.4} {...stroke} />
                <Circle cx={18} cy={18} r={2.4} {...stroke} />
                <Path d="M8.2 10.8 15.8 7M8.2 13.2 15.8 17" {...stroke} />
              </>
            );
          case 'download':
            return (
              <>
                <Path d="M12 4v11M7.5 11.5 12 16l4.5-4.5" {...stroke} />
                <Path d="M5 19h14" {...stroke} />
              </>
            );
          case 'eye':
            // Not from the design canvas like the rest of this file (no
            // matching mockup existed yet) — a plain lens+pupil outline in
            // the same stroke style, swap for a canvas-sourced version later.
            return (
              <>
                <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" {...stroke} />
                <Circle cx={12} cy={12} r={3} {...stroke} />
              </>
            );
          case 'noWatermark':
            return (
              <>
                <Rect x={4} y={5} width={16} height={12} rx={2} {...stroke} />
                <Path d="M4 17l16-12" {...stroke} />
              </>
            );
          case 'settings':
            return (
              <>
                <Circle cx={12} cy={12} r={3} {...stroke} />
                <Path
                  d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8l1.8-1.8M18 6l1.8-1.8"
                  {...stroke}
                />
              </>
            );
          case 'sun':
            return (
              <>
                <Circle cx={12} cy={12} r={4} {...stroke} />
                <Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" {...stroke} />
              </>
            );
          case 'moon':
            return <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" {...stroke} />;
          case 'shield':
            return <Path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" {...stroke} />;
          case 'bell':
            return (
              <>
                <Path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" {...stroke} />
                <Path d="M10 20a2 2 0 0 0 4 0" {...stroke} />
              </>
            );
          case 'globe':
            return (
              <>
                <Circle cx={12} cy={12} r={9} {...stroke} />
                <Path d="M3 12h18M12 3c2.5 2.5 4 5.7 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.7-4-9s1.5-6.5 4-9z" {...stroke} />
              </>
            );
          case 'help':
            return (
              <>
                <Circle cx={12} cy={12} r={9} {...stroke} />
                <Path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2 2-2 3.5" {...stroke} />
                <Circle cx={12} cy={17} r={0.6} fill={color} stroke="none" />
              </>
            );
          case 'logout':
            return (
              <>
                <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...stroke} />
                <Path d="M16 17l5-5-5-5" {...stroke} />
                <Path d="M21 12H9" {...stroke} />
              </>
            );
          case 'mail':
            return (
              <>
                <Rect x={3} y={5} width={18} height={14} rx={2} {...stroke} />
                <Path d="M4 7l8 6 8-6" {...stroke} />
              </>
            );
          case 'shuffle':
            return (
              <>
                <Path d="M17 3l1.5 3.5L22 8l-3.5 1.5L17 13l-1.5-3.5L12 8l3.5-1.5z" {...stroke} />
                <Path d="M6 13l1 2.5L9.5 16 7 17l-1 2.5-1-2.5L2.5 16 5 15.5z" {...stroke} />
              </>
            );
          case 'tip':
            return (
              <>
                <Circle cx={12} cy={12} r={9} {...stroke} />
                <Path d="M12 8v5" {...stroke} />
                <Circle cx={12} cy={16} r={0.5} fill={color} stroke="none" />
              </>
            );
          case 'filter':
            return <Path d="M4 6h16M7 12h10M10 18h4" {...stroke} />;
          case 'styleRealistic':
            return (
              <>
                <Rect x={3} y={7} width={18} height={13} rx={2} {...stroke} />
                <Path d="M8 7l1.5-2.5h5L16 7" {...stroke} />
                <Circle cx={12} cy={13.5} r={3.3} {...stroke} />
              </>
            );
          case 'styleNeon':
            return <Path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" {...stroke} strokeLinejoin="round" />;
          case 'styleCartoon':
            return (
              <>
                <Circle cx={12} cy={12} r={8} {...stroke} />
                <Circle cx={9} cy={10} r={0.9} fill={color} stroke="none" />
                <Circle cx={15} cy={10} r={0.9} fill={color} stroke="none" />
                <Path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" {...stroke} />
              </>
            );
          case 'styleAnime':
            return <Path d="M12 3l5 5-5 13-5-13z" {...stroke} strokeLinejoin="round" />;
          case 'styleCyberpunk':
            return (
              <>
                <Rect x={7} y={7} width={10} height={10} rx={1.5} {...stroke} />
                <Path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" {...stroke} />
              </>
            );
          case 'styleWatercolor':
            return <Path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" {...stroke} strokeLinejoin="round" />;
          case 'style3d':
            return (
              <>
                <Path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...stroke} strokeLinejoin="round" />
                <Path d="M4 7.5 12 12l8-4.5" {...stroke} />
                <Path d="M12 12v9" {...stroke} />
              </>
            );
          case 'styleVintage':
            return (
              <>
                <Rect x={3} y={5} width={18} height={14} rx={2} {...stroke} />
                <Circle cx={7} cy={9} r={1} fill={color} stroke="none" />
                <Circle cx={7} cy={15} r={1} fill={color} stroke="none" />
                <Circle cx={17} cy={9} r={1} fill={color} stroke="none" />
                <Circle cx={17} cy={15} r={1} fill={color} stroke="none" />
              </>
            );
          default:
            return null;
        }
      })()}
    </Svg>
  );
}
