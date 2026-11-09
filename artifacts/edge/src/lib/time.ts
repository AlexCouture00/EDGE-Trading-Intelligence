import { formatInTimeZone } from "date-fns-tz";
import { useGetSettings } from "@workspace/api-client-react";
import { useMode } from "./mode";

export function useTimezone() {
  const { dp } = useMode();
  return useGetSettings(dp).data?.timezone ?? "UTC";
}
export function useDateFormatter() {
  const timezone = useTimezone();
  return (iso: string | null | undefined, pattern = "dd MMM yy, HH:mm") => {
    if (!iso || Number.isNaN(new Date(iso).getTime())) return "—";
    return formatInTimeZone(iso, timezone, pattern);
  };
}
