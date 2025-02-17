import {
  Plugin,
  HeadingCache,
  FrontMatterCache,
  CachedMetadata,
  TFile,
  Notice,
  debounce
} from "obsidian";

function basename(path: string): string {
  let base = new String(path).substring(path.lastIndexOf("/") + 1);
  return base;
}
//ファイル名から拡張子を取得する関数
function getExt(filename)
{
	var pos = filename.lastIndexOf('.');
	if (pos === -1) return '';
	return filename.slice(pos + 1);
}

export default class TitleAsLinkTextPlugin extends Plugin {
  private debouncedUpdateBackLinks: (
    file: TFile,
    oldPath: string,
    notify: boolean
  ) => void;

  async onload() {
    this.debouncedUpdateBackLinks = debounce(
      this.updateBackLinks.bind(this),
      1000,
      true
    );

    this.registerEvent(
      this.app.vault.on("rename", async (file: TFile, oldPath) => {
        this.debouncedUpdateBackLinks(file, oldPath, true);
      })
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", async (file: TFile) => {
        this.debouncedUpdateBackLinks(file, file.path, true);
      })
    );

    this.addCommand({
      id: "update-all-links",
      name: "Update All Links",
      callback: async () => {
        await this.updateAllLinks();
      },
    });
  }

  async updateAllLinks() {
    const markdownFiles = this.app.vault.getMarkdownFiles();

    var updatedBacklinksCount = 0;
    for (const file of markdownFiles) {
      const oldPath = file.path;
      const backLinks = await this.updateBackLinks(file, oldPath, false);
      if (backLinks) {
        updatedBacklinksCount = backLinks + updatedBacklinksCount;
      }
    }

    new Notice(
      `Updated the link text of ${updatedBacklinksCount} Markdown link(s).`
    );
  }

  async updateBackLinks(file: TFile, oldPath: string, notify: boolean) {
    if (
      !oldPath ||
      !file.path.toLocaleLowerCase().endsWith(".md") ||
      !(file instanceof TFile)
    ) {
      return;
    }

    const cachedFile = this.app.metadataCache.getFileCache(file);
    if (!cachedFile) {
      return;
    }
    const title = this.getPageTitle(cachedFile, file.path);
    const notes = this.getCachedNotesThatHaveLinkToFile(oldPath);

    if (notes.length == 0) {
      return;
    }

    let updatedBacklinksCount = 0;

    for (let note of notes) {
      const fileContent = await this.app.vault.read(note);
      const newFileContent = fileContent.replace(
        /\[(.*?)\]\((<([^>]+)>|(.+))\)/g,
        (_, linkText, __, linkUrl_1, linkUrl_2) => {
          let linkUrl = linkUrl_1 || linkUrl_2;
	  const base = basename(linkUrl);
	  const ext = getExt(base);

	  if(!ext){
	    linkUrl += ".md";
	  }
		
          //const linkUrlDecoded = linkUrl
          const linkUrlDecoded = decodeURIComponent(linkUrl);
          if (basename(linkUrlDecoded) === basename(oldPath)) {
            return `[${title}](<${linkUrlDecoded}>)`;
          }
          return `[${linkText}](<${linkUrlDecoded}>)`;
        }
      );

      if (fileContent !== newFileContent) {
        await this.app.vault.modify(note, newFileContent);
        updatedBacklinksCount++;
      }
    }

    if (notify && updatedBacklinksCount > 0) {
      new Notice(
        `Updated the link text of ${updatedBacklinksCount} Markdown link(s).`
      );
    }

    return updatedBacklinksCount;
  }

  getCachedNotesThatHaveLinkToFile(filePath: string): TFile[] {
    let notesWithBacklinks: TFile[] = [];
    let allNotes = this.app.vault.getMarkdownFiles();

    if (allNotes) {
      for (let note of allNotes) {
        let notePath = note.path;

        if (note.path == filePath) {
          continue;
        }

        const noteCache = this.app.metadataCache.getCache(notePath);
        const embedsAndLinks = [
          ...(noteCache?.embeds || []),
          ...(noteCache?.links || []),
        ];
        if (embedsAndLinks) {
          for (let link_data of embedsAndLinks) {
            // getFirstLinkpathDest = Get the best match for a linkpath.
            // https://marcus.se.net/obsidian-plugin-docs/reference/typescript/classes/MetadataCache
            const firstLinkPath = app.metadataCache.getFirstLinkpathDest(
              link_data.link,
              note.path
            );
            if (firstLinkPath && firstLinkPath.path == filePath) {
              notesWithBacklinks.push(note);
            }
          }
        }
      }
    }

    return notesWithBacklinks;
  }

  getPageTitle(cache: CachedMetadata, filePath: string): string {
    const frontMatterTitle =
      cache.frontmatter && (cache.frontmatter as FrontMatterCache).title;
    const firstHeading =
      cache.headings && (cache.headings[0] as HeadingCache).heading;
    return (
      frontMatterTitle || firstHeading || basename(filePath).replace(".md", "")
    );
  }
}
