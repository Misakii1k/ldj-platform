import React from "react";

export type FruitType = "durian" | "strawberry" | "banana" | "grape" | "apple";

export const FRUIT_COLORS: Record<FruitType, string> = {
  durian: "#D4A017",
  strawberry: "#E74C3C",
  banana: "#F1C40F",
  grape: "#8E44AD",
  apple: "#27AE60",
};

export const FRUIT_NAMES: Record<FruitType, string> = {
  durian: "榴莲",
  strawberry: "草莓",
  banana: "香蕉",
  grape: "葡萄",
  apple: "苹果",
};

export const FRUIT_EMOJI: Record<FruitType, string> = {
  durian: "🥭",
  strawberry: "🍓",
  banana: "🍌",
  grape: "🍇",
  apple: "🍎",
};

export const FruitIcon: React.FC<{
  fruit: FruitType;
  size?: number;
  showLabel?: boolean;
}> = ({ fruit, size = 48, showLabel = false }) => {
  const color = FRUIT_COLORS[fruit];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 30%, ${color}dd, ${color}88)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.55,
          boxShadow: `0 2px 12px ${color}55, inset 0 -3px 8px rgba(0,0,0,0.2)`,
          border: "2px solid rgba(255,255,255,0.3)",
        }}
      >
        {FRUIT_EMOJI[fruit]}
      </div>
      {showLabel && (
        <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
          {FRUIT_NAMES[fruit]}
        </span>
      )}
    </div>
  );
};
