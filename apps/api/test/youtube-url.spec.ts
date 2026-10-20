import { parseYouTubeVideoId } from "../src/modules/music/providers/youtube-music.provider";

describe("parseYouTubeVideoId", () => {
  const id = "dQw4w9WgXcQ";

  it.each([
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `  https://youtu.be/${id}  `,
  ])("extracts the id from %s", (input) => {
    expect(parseYouTubeVideoId(input)).toBe(id);
  });

  it.each([
    "",
    "not a url",
    "https://vimeo.com/123456789",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UC1234567890",
    `https://evil.example.com/watch?v=${id}`,
    `javascript:alert(1)//youtu.be/${id}`,
  ])("rejects %s", (input) => {
    expect(parseYouTubeVideoId(input)).toBeNull();
  });
});
