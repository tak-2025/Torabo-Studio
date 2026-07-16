import { useT } from "./i18n";

export interface AppFooterProps {
  onShowAbout: () => void;
  onShowLicenseNotice: () => void;
}

export const AppFooter = ({
  onShowAbout,
  onShowLicenseNotice,
}: AppFooterProps) => {
  const t = useT();
  return (
    <div className="grid justify-center p-1 bg-base-200">
      <div>
        <span>&copy; 2024 - The ZMK Contributors</span> -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowAbout}>
          {t("footer.about")}
        </a>{" "}
        -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowLicenseNotice}>
          {t("footer.license")}
        </a>
      </div>
    </div>
  );
};
