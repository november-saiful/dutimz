"use client";

import { Download, Palette, Type } from "lucide-react";

import {
  TreeFolder,
  TreeItem,
  TreeSection,
  TreeView,
} from "@/components/ui/animated-file-tree";

export function TreeDemo() {
  return (
    <div className="w-full max-w-[240px] rounded-lg bg-card py-2">
      <TreeView defaultSelectedId="announcement">
        <TreeSection title="Getting Started" defaultExpanded>
          <TreeItem id="installation" label="Installation" icon={Download} />
        </TreeSection>

        <TreeSection title="Foundations" defaultExpanded>
          <TreeItem id="color" label="Color" icon={Palette} />
          <TreeItem id="typography" label="Typography" icon={Type} />
        </TreeSection>

        <TreeSection title="Base" defaultExpanded>
          <TreeItem id="announcement" label="Announcement" />
          <TreeItem id="avatar" label="Avatar" />
          <TreeItem id="badge" label="Badge" />

          <TreeFolder id="buttons-folder" label="Buttons" defaultExpanded={false}>
            <TreeItem id="button" label="Button" />
            <TreeItem id="button-group" label="Button Group" />
          </TreeFolder>

          <TreeItem id="carousel" label="Carousel" badge="NEW" />
          <TreeItem id="checkbox" label="Checkbox" />
        </TreeSection>
      </TreeView>
    </div>
  );
}
