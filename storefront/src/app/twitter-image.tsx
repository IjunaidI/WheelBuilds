// Twitter's `summary_large_image` card uses the same 1200x630 aspect as the
// OG image, and this route rendered byte-identical output to
// opengraph-image.tsx (same scene, same font, same size). Re-export instead
// of maintaining two copies of the same file (review finding, WB-095 Task 1
// fix wave).
export { default, alt, size, contentType } from "./opengraph-image"
