import { PropsWithChildren } from "react";
import BehaviorShortNames from "./behavior-short-names.json";

interface KeyProps {
  selected?: boolean;
  width: number;
  height: number;
  oneU: number;
  header?: string;
  /** What the hold half of a hold-tap does, appended to the header (e.g. the
   *  "2" of "LT 2"). The body shows the tap key, so without this the hold half
   *  would be invisible on the board. */
  hold?: string;
  /** Draw the key recessed. Used for the behaviors that do nothing of their own
   *  (&trans falls through to the layer below, &none swallows the press): they
   *  are the background of a layer, not part of what it does, and at a glance
   *  the eye should skip them to find the keys that matter. */
  muted?: boolean;
  onClick?: () => void;
}

interface BehaviorShortName {
  short?: string;
}

const MAX_HEADER_LENGTH = 9;
const shortNames: Record<string, BehaviorShortName> = BehaviorShortNames;

const shortenHeader = (header: string | undefined) => {
  if(typeof header === "undefined"){
    return "";
  }
  // Empty string is a valid header for behaviors where we don't want to see a header, which is falsy
  // So we use an undefined check here
  if(typeof shortNames[header]?.short !== "undefined"){
    return shortNames[header].short;
  } else if(header.length > MAX_HEADER_LENGTH){
    const words = header.split(/[\s,-]+/);
    const lettersPerWord = Math.trunc(MAX_HEADER_LENGTH / words.length);
    return words.map((word) => (word.substring(0,lettersPerWord))).join("");
  } else {
    return header;
  }
}

export const Key = ({
  selected = false,
  width,
  height,
  oneU,
  header,
  hold,
  muted = false,
  onClick,
  children,
}: PropsWithChildren<KeyProps>) => {
  const pixelWidth = width * oneU - 2;
  const pixelHeight = height * oneU - 2;

  // Shorten first, then append: the short name is looked up by the exact
  // display name, so "Mod-Tap Shft" would never match the table.
  const headerText = [shortenHeader(header), hold].filter(Boolean).join(" ");

  return (
    <button
      className={`group rounded relative flex justify-center items-center cursor-pointer transition-all hover:shadow-xl hover:ring-1 hover:ring-gray-300 hover:scale-125 ${selected
          ? "bg-primary text-primary-content"
          : muted
            ? "bg-base-200 text-base-content/40"
            : "bg-base-100 text-base-content"
        }`}
      style={{
        width: `${pixelWidth}px`,
        height: `${pixelHeight}px`,
      }}
      onClick={onClick}
    >
      {/* Pinned to both edges rather than centred on a point, so a long
          header — "LT " plus a Japanese layer name — is clipped by the key
          instead of spilling over its neighbours. */}
      <div
        className={`absolute text-keycap ${selected ? "text-primary-content" : "z1text-base-content"} opacity-80 top-1 left-0 right-0 px-0.5 font-light text-center truncate`}
      >
        {headerText}
      </div>
      {children}
    </button>
  );
};
