import type { ColorScheme } from "@/constants/theme";

export function getAppPalette(scheme: ColorScheme) {
  if (scheme === "light") {
    return {
      ink: "#092A24",
      inkSoft: "#385A50",
      buttonText: "#FFFFFF",
      paper: "#F7FCFA",
      card: "#FFFFFF",
      line: "#CFE8DC",
      muted: "#59776C",
      blue: "#07885A",
      blueSoft: "#E9FAF3",
      green: "#07885A",
      success: "#07885A",
      greenSoft: "#E9FAF3",
      amber: "#A86500",
      amberSoft: "#FFF4DB",
      red: "#C9343B",
      redSoft: "#FDECEE",
    };
  }
  return {
    ink: "#E9FAF3",
    inkSoft: "#B7D9CB",
    buttonText: "#FFFFFF",
    paper: "#092A24",
    card: "#10372E",
    line: "#285448",
    muted: "#9ABCAF",
    blue: "#2EF2A0",
    blueSoft: "#123F34",
    green: "#07885A",
    success: "#2EF2A0",
    greenSoft: "#123F34",
    amber: "#F5A524",
    amberSoft: "#463719",
    red: "#E5484D",
    redSoft: "#44242A",
  };
}

export type AppPalette = ReturnType<typeof getAppPalette>;
