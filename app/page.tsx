"use client";
import dynamic from "next/dynamic";

const CryptoBubbles = dynamic(() => import("@/components/CryptoBubbles"), {
  ssr: false,
});

export default function Home() {
  return <CryptoBubbles />;
}
