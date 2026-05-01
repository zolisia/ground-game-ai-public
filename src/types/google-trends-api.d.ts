// Minimal ambient declaration for google-trends-api (no @types package exists
// because the library has been unpublished since 2020-12-28). Covers only the
// methods consumed by src/app/api/trends-v2/route.ts.

declare module "google-trends-api" {
  interface TrendsOptions {
    keyword?: string | string[];
    geo?: string;
    startTime?: Date;
    endTime?: Date;
    resolution?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  const googleTrends: {
    dailyTrends(opts: TrendsOptions): Promise<string>;
    interestOverTime(opts: TrendsOptions): Promise<string>;
    interestByRegion(opts: TrendsOptions): Promise<string>;
  };

  export default googleTrends;
}
