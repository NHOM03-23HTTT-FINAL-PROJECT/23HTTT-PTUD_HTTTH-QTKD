import type { CSSProperties } from 'react';
import './Icon.css';

const svgUrls = import.meta.glob('../../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/*
 * Vị trí nét vẽ của từng icon trong khung 20×20, giữ nguyên hai lớp inset như component
 * Icon/* trên Figma (Group + phần bù độ dày nét). SVG gốc được dùng làm mask để đổi màu
 * bằng `color`, đúng mô tả "đổi màu bằng variable trên nét vẽ".
 */
const ICON_LAYOUT = {
  grid: ['12.5%', '-5.56%'],
  users: ['12.5% 8.33%', '-5.56% -5%'],
  'user-plus': ['12.5% 8.33%', '-5.56% -5%'],
  'map-pin': ['8.33% 16.67%', '-5% -6.25%'],
  layers: ['8.33%', '-5%'],
  file: ['8.33% 16.67%', '-5% -6.25%'],
  'file-plus': ['8.33% 16.67%', '-5% -6.25%'],
  edit: ['11.99% 12.5% 16.67% 12.5%', '-5.84% -5.56%'],
  inbox: ['16.67% 8.33%', '-6.25% -5%'],
  check: ['8.33%', '-5%'],
  clock: ['8.33%', '-5%'],
  history: ['12.5% 12.5% 12.47% 12.5%', '-5.55% -5.56%'],
  workflow: ['12.5%', '-5.56%'],
  shield: ['8.33% 16.67%', '-5% -6.25%'],
  pause: ['8.33%', '-5%'],
  play: ['8.33%', '-5%'],
  activity: ['12.5% 8.33%', '-5.56% -5%'],
  list: ['25% 12.5%', '-8.33% -5.56%'],
  lock: ['8.33% 12.5%', '-5% -5.56%'],
  logout: ['12.5%', '-5.56%'],
  bell: ['8.33% 12.5% 8.31% 12.5%', '-5% -5.56%'],
  search: ['12.5%', '-5.56%'],
  chevron: ['37.5% 25%', '-16.67% -8.33%'],
  'arrow-right': ['20.83%', '-7.14%'],
  building: ['8.33% 16.67%', '-5% -6.25%'],
  alert: ['12.44% 8.34% 12.5% 8.26%', '-5.55% -5%'],
  info: ['8.33%', '-5%'],
  'x-circle': ['8.33%', '-5%'],
  x: ['25%', '-8.33%'],
  refresh: ['12.5% 12.5% 12.47% 12.5%', '-5.55% -5.56%'],
  'git-compare': ['12.5%', '-5.56%'],
  eye: ['0', '0'],
  'eye-off': ['0', '0'],
  mail: ['0', '0'],
  user: ['0', '0'],
} as const;

export type IconName = keyof typeof ICON_LAYOUT;

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
};

export function Icon({ name, size = 20, className, title }: IconProps) {
  const [outer, inner] = ICON_LAYOUT[name];
  const url = svgUrls[`../../assets/icons/${name}.svg`];
  const glyphStyle: CSSProperties = {
    inset: inner,
    WebkitMaskImage: `url("${url}")`,
    maskImage: `url("${url}")`,
  };

  return (
    <span
      className={className ? `icon ${className}` : 'icon'}
      style={{ width: size, height: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <span className="icon__group" style={{ inset: outer }}>
        <span className="icon__glyph" style={glyphStyle} />
      </span>
    </span>
  );
}
