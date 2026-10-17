import type { Accessory, Persona } from "@/core/ai/personas";
import { GUIDE } from "@/core/ai/personas";
import { mixHex } from "./colors";

export type Mood = "idle" | "happy" | "thinking" | "surprised" | "sad" | "smug" | "talking";

interface Props {
  persona?: Pick<Persona, "body" | "belly" | "accessory" | "name">;
  mood?: Mood;
  size?: number | string;
  className?: string;
}

const PUPIL_OFFSET: Record<Mood, [number, number]> = {
  idle: [0, 0],
  happy: [0, 0],
  thinking: [-3, -4],
  surprised: [0, 0],
  sad: [0, 3],
  smug: [3, 0],
  talking: [0, 1],
};

const BODY_ANIMATION: Record<Mood, string> = {
  idle: "mascot-bob 3s ease-in-out infinite",
  talking: "mascot-bob 1.2s ease-in-out infinite",
  happy: "mascot-jump 0.6s ease-in-out 2",
  thinking: "mascot-think 1.6s ease-in-out infinite",
  surprised: "mascot-jump 0.35s ease-out 1",
  sad: "mascot-shake 0.4s ease-in-out 2",
  smug: "mascot-bob 3s ease-in-out infinite",
};

/** The owl. One drawing, coloured and dressed per persona, with a few expressions. */
export function Mascot({ persona = GUIDE, mood = "idle", size = 96, className = "" }: Props) {
  const wing = mixHex(persona.body, "#000000", 0.18);
  const tuft = mixHex(persona.body, "#000000", 0.08);
  const [dx, dy] = PUPIL_OFFSET[mood];
  const wingLift = mood === "happy" ? -35 : mood === "surprised" ? -20 : 0;
  const eyeR = mood === "surprised" ? 12.5 : 11;
  const pupilR = mood === "surprised" ? 4 : 5.5;

  return (
    <svg
      viewBox="0 0 100 112"
      width={size}
      height={typeof size === "number" ? size * 1.12 : undefined}
      className={className}
      role="img"
      aria-label={`${persona.name} the owl`}
      style={{ overflow: "visible" }}
    >
      <g style={{ animation: BODY_ANIMATION[mood], transformOrigin: "50px 100px" }}>
        {/* feet */}
        <ellipse cx="40" cy="103" rx="7" ry="3.5" fill="#f39c12" />
        <ellipse cx="60" cy="103" rx="7" ry="3.5" fill="#f39c12" />
        {/* wings (behind the body) */}
        <g style={{ transform: `rotate(${wingLift}deg)`, transformOrigin: "24px 52px", transition: "transform .3s" }}>
          <ellipse cx="19" cy="68" rx="9" ry="19" fill={wing} transform="rotate(14 19 68)" />
        </g>
        <g style={{ transform: `rotate(${-wingLift}deg)`, transformOrigin: "76px 52px", transition: "transform .3s" }}>
          <ellipse cx="81" cy="68" rx="9" ry="19" fill={wing} transform="rotate(-14 81 68)" />
        </g>
        {/* ear tufts */}
        <polygon points="20,34 25,10 42,27" fill={tuft} />
        <polygon points="80,34 75,10 58,27" fill={tuft} />
        {/* body */}
        <ellipse cx="50" cy="63" rx="34" ry="41" fill={persona.body} />
        {/* belly with feathers */}
        <ellipse cx="50" cy="77" rx="21" ry="22" fill={persona.belly} />
        {[0, 1, 2].map((row) =>
          [0, 1, 2].slice(0, 3 - (row === 2 ? 1 : 0)).map((col) => {
            const x = 40 + col * 10 + (row % 2 ? 5 : 0);
            const y = 70 + row * 8;
            return <path key={`${row}-${col}`} d={`M${x - 3} ${y} Q${x} ${y + 4} ${x + 3} ${y}`} stroke={wing} strokeOpacity="0.45" strokeWidth="1.3" fill="none" strokeLinecap="round" />;
          })
        )}
        {/* face disc */}
        <circle cx="37" cy="44" r="16" fill={persona.belly} />
        <circle cx="63" cy="44" r="16" fill={persona.belly} />
        {/* eyes */}
        {mood === "happy" ? (
          <g stroke="#1d1d1f" strokeWidth="3.4" fill="none" strokeLinecap="round">
            <path d="M29 47 Q37 37 45 47" />
            <path d="M55 47 Q63 37 71 47" />
          </g>
        ) : (
          <g style={{ animation: "mascot-blink 4.5s infinite", transformOrigin: "50px 44px" }}>
            {[37, 63].map((cx) => (
              <g key={cx}>
                <circle cx={cx} cy="44" r={eyeR} fill="#ffffff" />
                <circle cx={cx + dx} cy={44 + dy} r={pupilR} fill="#1d1d1f" />
                <circle cx={cx + dx + 1.8} cy={44 + dy - 2} r="1.8" fill="#ffffff" />
              </g>
            ))}
            {(mood === "smug" || mood === "sad") && (
              <g fill={persona.belly}>
                {mood === "smug" ? (
                  <>
                    <rect x="25" y="32" width="24" height="11" />
                    <rect x="51" y="32" width="24" height="11" />
                  </>
                ) : (
                  <>
                    <polygon points="25,32 49,32 49,36 25,42" />
                    <polygon points="51,32 75,32 75,42 51,36" />
                  </>
                )}
              </g>
            )}
          </g>
        )}
        {/* eyebrows when thinking */}
        {mood === "thinking" && (
          <g stroke={wing} strokeWidth="2.5" strokeLinecap="round">
            <path d="M28 29 L44 31" />
            <path d="M56 29 L72 27" />
          </g>
        )}
        {/* beak */}
        {mood === "surprised" || mood === "talking" ? (
          <g>
            <polygon points="45,52 55,52 50,57" fill="#f39c12" />
            <ellipse cx="50" cy="59" rx="3" ry="2.6" fill="#5a2d0c" style={mood === "talking" ? { animation: "mascot-blink 0.5s infinite", transformOrigin: "50px 59px" } : undefined} />
            <polygon points="46,61 54,61 50,64" fill="#e08a0c" />
          </g>
        ) : (
          <polygon points="45,52 55,52 50,61" fill="#f39c12" />
        )}
        {mood === "thinking" && (
          <g fill={wing}>
            <circle cx="88" cy="26" r="2" />
            <circle cx="93" cy="18" r="3" />
            <circle cx="98" cy="8" r="4" />
          </g>
        )}
        <AccessoryLayer accessory={persona.accessory} />
      </g>
    </svg>
  );
}

function AccessoryLayer({ accessory }: { accessory: Accessory }) {
  switch (accessory) {
    case "eggshell":
      return (
        <path
          d="M16 86 L24 80 L31 87 L38 80 L45 87 L52 80 L59 87 L66 80 L73 87 L80 80 L85 86 Q84 108 50 108 Q16 108 16 86 Z"
          fill="#fffaf0"
          stroke="#e4d6b8"
          strokeWidth="1.2"
        />
      );
    case "scarf":
      return (
        <g>
          <path d="M20 58 Q50 68 80 58 L80 65 Q50 75 20 65 Z" fill="#d94b4b" />
          <path d="M66 64 L74 64 L77 84 L68 84 Z" fill="#c43c3c" />
          <path d="M68 80 L77 80" stroke="#f4d03f" strokeWidth="2" />
        </g>
      );
    case "glasses":
      return (
        <g>
          <g fill="none" stroke="#2c2c2c" strokeWidth="2.2">
            <circle cx="37" cy="44" r="13.5" />
            <circle cx="63" cy="44" r="13.5" />
            <path d="M47.5 41 Q50 38 52.5 41" />
          </g>
          <path d="M42 64 L50 68 L58 64 L58 72 L50 68 L42 72 Z" fill="#c0392b" />
        </g>
      );
    case "hood":
      return (
        <g>
          <path d="M22 26 Q50 -6 82 22 Q92 6 99 12 Q90 14 86 30 Q52 12 22 26 Z" fill="#26305a" />
          <circle cx="99" cy="12" r="4" fill="#f4e7a1" />
          <path d="M60 86 a7 7 0 1 0 6 -10 a5.5 5.5 0 1 1 -6 10 Z" fill="#f4e7a1" />
        </g>
      );
    case "crown":
      return (
        <g>
          <polygon points="33,22 36,6 44,16 50,2 56,16 64,6 67,22" fill="#f4c430" stroke="#c99a06" strokeWidth="1.2" />
          <circle cx="50" cy="15" r="2.4" fill="#d6336c" />
          <circle cx="40" cy="18" r="1.6" fill="#1c7ed6" />
          <circle cx="60" cy="18" r="1.6" fill="#1c7ed6" />
        </g>
      );
    case "visor":
      return (
        <g>
          <rect x="18" y="35" width="64" height="17" rx="8.5" fill="#00e0b8" fillOpacity="0.32" stroke="#00e0b8" strokeWidth="1.5" />
          <path d="M22 43 L78 43" stroke="#9ffbe9" strokeOpacity="0.6" strokeWidth="1" />
        </g>
      );
    default:
      return null;
  }
}
