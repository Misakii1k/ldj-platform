/**
 * CSS Modules 的类型声明（D4-UI0 首次引入 co-located *.module.css）。
 * 仅声明本仓库使用的 CSS 模块导入形状，不引入 vite/client 全部类型面。
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
