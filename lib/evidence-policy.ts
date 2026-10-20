export const qualitativeSourcePolicy = `YOUTUBE AND SOCIAL EVIDENCE
Actively seek relevant YouTube videos (founder/management interviews, product demonstrations, technical talks and independent criticism) and public social posts or discussions on X, Reddit, LinkedIn and project/community forums. Use these alongside financial filings, official documentation and independent reporting. Prioritize firsthand, identifiable authors and substantive dissent over popularity. Include direct video or post permalinks, author/channel, publication date and the specific claim supported; include a video timestamp only when verified from accessible content. Distinguish official statements, customer/developer experience and third-party commentary. Disclose sponsorship, holdings or other incentives when known; flag anonymous, promotional, coordinated or unrepresentative signals. Corroborate material factual claims against primary records; engagement and sentiment are not evidence of revenue, adoption or investment value. Never invent posts, transcripts, quotes, dates or timestamps. Do not claim to have watched a video or read its transcript when only a title, description or search excerpt was accessible. State exactly what was accessible and what remains unverified. If a video, transcript or social post is inaccessible, record it as a diligence lead or evidence gap, not verified support. In the qualitative chapter, include a compact evidence table of substantive video/social findings (source/author, date, claim, accessible material, corroboration and bias); if none can be accessed, say so. Apply the report's as-of date and mark later material explicitly.`;

export function sourceHost(url:string){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return 'unknown source';}}
export function sourceKind(url:string):'video'|'social'|'web'{
 try{
  const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
  const belongs=(domains:string[])=>domains.some(domain=>host===domain||host.endsWith('.'+domain));
  if(belongs(['youtube.com','youtu.be']))return 'video';
  if(belongs(['x.com','twitter.com','reddit.com','linkedin.com','bsky.app','threads.net','threads.com','facebook.com','instagram.com','tiktok.com','t.me']))return 'social';
 }catch{}
 return 'web';
}
