/**
 * 奶酪大盗专用小图标：全部 currentColor 剪影，替代原先散落的 emoji。
 *
 * emoji 在不同系统上长相不一、颜色也跟不了主题；这里统一成 1em 见方的
 * 单色 SVG，颜色交给外层文字色，尺寸交给外层字号。
 */
import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { readonly title?: string };

function Svg({ title, children, className, ...rest }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      className={className ? `ct-icon ${className}` : 'ct-icon'}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** 奶酪楔块：三角体 + 三个孔洞（孔洞用 evenodd 镂空）。 */
export function CheeseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M2 17.5 21 8.2V19a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-1.5Zm6 .2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Zm7.5-.9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm2.3-4.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM3 16.3 17.6 5.1a1 1 0 0 1 1.3.1l1.6 1.7L3 16.3Z"
      />
    </Svg>
  );
}

/** 老鼠侧影：圆耳 + 尖鼻 + 卷尾。 */
export function MouseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="6.5" r="3.2" />
      <path d="M3.5 15.5C3.5 11 7 8.5 11 8.5c3.3 0 5.6 1.6 7 4l2.6.9a.8.8 0 0 1 .1 1.5L18.4 16c-.9 1.6-2.9 2.5-5.6 2.5H7.3c-2.2 0-3.8-1.2-3.8-3Z" />
      <path d="M4 17.6c-1.6.3-2.3 1.3-1.8 2.2.6 1 2.4.9 4.2.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

/** 猫头：两只尖耳。 */
export function CatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M4 3.5 8.6 7a9 9 0 0 1 6.8 0L20 3.5v8.3c0 4.6-3.6 8.2-8 8.2s-8-3.6-8-8.2V3.5Zm5.3 9.8a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm5.4 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6ZM12 16.6l1.2-1.2h-2.4l1.2 1.2Z"
      />
    </Svg>
  );
}

/** 狗头：两只垂耳。 */
export function DogIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M7 5.2C8.4 4.4 10.1 4 12 4s3.6.4 5 1.2l3.4-.9c.9-.2 1.6.7 1.3 1.5L20 11.4V13c0 3.9-3.6 7-8 7s-8-3.1-8-7v-1.6L2.3 5.8C2 5 2.7 4.1 3.6 4.3L7 5.2Zm2.3 7.3a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm5.4 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM10.4 15c0 .9.7 1.6 1.6 1.6s1.6-.7 1.6-1.6h-3.2Z"
      />
    </Svg>
  );
}

/** 弯月。 */
export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 14.6A8.5 8.5 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" />
    </Svg>
  );
}

/** 太阳：圆心 + 八道光。 */
export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4.4" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" />
      </g>
    </Svg>
  );
}

/** 投票箱：箱体 + 投入口里半张票。 */
export function BallotIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3h8v6.5H8z" opacity="0.7" />
      <path d="M3 10.5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5Zm5 1.3v1.4h8v-1.4H8Z" fillRule="evenodd" />
    </Svg>
  );
}

/** 眼睛（偷看 / 查验）。 */
export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M12 5c4.6 0 8.3 3.1 9.8 7-1.5 3.9-5.2 7-9.8 7s-8.3-3.1-9.8-7C3.7 8.1 7.4 5 12 5Zm0 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
      />
    </Svg>
  );
}

/** 卷轴。 */
export function ScrollIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path fillRule="evenodd" d="M7 3h11a3 3 0 0 1 3 3v2h-4v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2h4V6a3 3 0 0 1 3-3Zm2 5v1.4h5V8H9Zm0 3.2v1.4h5v-1.4H9Zm0 3.2v1.4h3.5v-1.4H9Z" />
    </Svg>
  );
}

/** 警示三角。 */
export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M10.3 3.6a2 2 0 0 1 3.4 0l8 13.6A2 2 0 0 1 20 20.2H4a2 2 0 0 1-1.7-3L10.3 3.6ZM11 9v5h2V9h-2Zm1 8.6a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"
      />
    </Svg>
  );
}

/** 骰子（一面五点）。 */
export function DieIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 6.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm8 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm-4 4.1a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm-4 4.1a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm8 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z"
      />
    </Svg>
  );
}

/** 白旗（弃票）。 */
export function FlagIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 2.5h1.6v19H5z" />
      <path d="M7.5 4h11.2l-2.6 4 2.6 4H7.5z" opacity="0.85" />
    </Svg>
  );
}

/** 大屏（公共桌面）。 */
export function ScreenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path fillRule="evenodd" d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2 0v10h14V5H5Z" />
      <path d="M9 19h6v2H9z" />
    </Svg>
  );
}
