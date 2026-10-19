import React from "react";
import {safeUrl} from "../lib/research";
function inline(text:string):React.ReactNode[]{
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map((part,i)=>{
    const link=part.match(/^\[([^\]]+)\]\((.+)\)$/);if(link){const url=safeUrl(link[2]);return url?<a key={i} href={url} target="_blank" rel="noopener noreferrer">{link[1]} ↗</a>:link[1];}
    if(part.startsWith("**")&&part.endsWith("**"))return <strong key={i}>{part.slice(2,-2)}</strong>;
    if(part.startsWith("`")&&part.endsWith("`"))return <code key={i}>{part.slice(1,-1)}</code>;return part;
  });
}
export function Markdown({text}:{text:string}){
 const blocks:React.ReactNode[]=[];const lines=text.split("\n");let i=0;
 while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
 if(line.startsWith("|")){const rows:string[][]=[];while(i<lines.length&&lines[i].startsWith("|")){const cells=lines[i++].replace(/^\||\|$/g,"").split("|").map(s=>s.trim());if(cells.every(s=>/^:?-+:?$/.test(s)))continue;rows.push(cells);}blocks.push(<div className="table-scroll" key={i}><table><thead><tr>{rows[0]?.map((v,j)=><th key={j}>{inline(v)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,k)=><tr key={k}>{row.map((v,j)=><td key={j}>{inline(v)}</td>)}</tr>)}</tbody></table></div>);continue;}
 const heading=line.match(/^(#{1,6})\s+(.+)/);if(heading){const Tag=heading[1].length<=2?"h2":"h3";blocks.push(<Tag key={i}>{inline(heading[2])}</Tag>);i++;continue;}
 if(/^[-*]\s/.test(line)){const items=[];while(i<lines.length&&/^[-*]\s/.test(lines[i]))items.push(lines[i++].slice(2));blocks.push(<ul key={i}>{items.map((s,j)=><li key={j}>{inline(s)}</li>)}</ul>);continue;}
 if(/^\d+\.\s/.test(line)){const items=[];while(i<lines.length&&/^\d+\.\s/.test(lines[i]))items.push(lines[i++].replace(/^\d+\.\s/,""));blocks.push(<ol key={i}>{items.map((s,j)=><li key={j}>{inline(s)}</li>)}</ol>);continue;}
 const paragraph=[];while(i<lines.length&&lines[i].trim()&&!/^(#|\||[-*]\s|\d+\.\s)/.test(lines[i]))paragraph.push(lines[i++]);if(!paragraph.length){paragraph.push(lines[i++]);}blocks.push(<p key={i}>{inline(paragraph.join(" "))}</p>);
 }
 return <div className="prose">{blocks}</div>;
}
