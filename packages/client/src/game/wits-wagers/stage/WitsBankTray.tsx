import { WitsBanknote } from './WitsBanknote.tsx';

export interface WitsBankTrayProps {
  readonly label?: string;
  readonly active?: boolean;
}

/** 钞箱里摆出来的三叠面值，从小到大 */
const STACKS = [100, 500, 1000] as const;

/**
 * 桌边银行钞箱。收付演出的起点与终点锚（data-ww-anchor="bank"）。
 *
 * 三叠面值各码几张，收付进行时 is-active 会让钞箱亮边、叠层轻抖，
 * 让"钱正在过银行"这件事在小屏上也看得见。
 */
export function WitsBankTray({ label = '银行', active = false }: WitsBankTrayProps) {
  return (
    <div
      className={`ww-bank ${active ? 'is-active' : ''}`.trim()}
      data-ww-anchor="bank"
      aria-label={`${label}钞箱`}
    >
      <div className="ww-bank__box" aria-hidden="true">
        {STACKS.map((denom, stackIndex) => (
          <span
            key={denom}
            className="ww-bank__stack"
            style={{ ['--ww-stack-i' as string]: String(stackIndex) }}
          >
            {[0, 1, 2].map((layer) => (
              <span
                key={layer}
                className="ww-bank__layer"
                style={{ ['--ww-layer' as string]: String(layer) }}
              >
                <WitsBanknote denomination={denom} width={30} />
              </span>
            ))}
          </span>
        ))}
      </div>
      <span className="ww-bank__label">{label}</span>
    </div>
  );
}
