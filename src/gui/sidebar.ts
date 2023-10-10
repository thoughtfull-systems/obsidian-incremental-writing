import { ItemView, WorkspaceLeaf, Menu, TFile } from "obsidian";

import type SRPlugin from "src/main";
import { COLLAPSE_ICON } from "src/constants";
import { ReviewDeck } from "src/ReviewDeck";
import { t } from "src/lang/helpers";

export const REVIEW_QUEUE_VIEW_TYPE = "review-queue-list-view";

export class ReviewQueueListView extends ItemView {
    private plugin: SRPlugin;
    public state = {};

    constructor(leaf: WorkspaceLeaf, plugin: SRPlugin) {
        super(leaf);

        this.plugin = plugin;
        this.registerEvent(this.app.workspace.on("file-open", () => this.redraw()));
        this.registerEvent(this.app.vault.on("rename", () => this.redraw()));
    }

    public getViewType(): string {
        return REVIEW_QUEUE_VIEW_TYPE;
    }

    public getDisplayText(): string {
        return t("NOTES_REVIEW_QUEUE");
    }

    public getIcon(): string {
        return "SpacedRepIcon";
    }

    public onHeaderMenu(menu: Menu): void {
        menu.addItem((item) => {
            item.setTitle(t("CLOSE"))
                .setIcon("cross")
                .onClick(() => {
                    this.app.workspace.detachLeavesOfType(REVIEW_QUEUE_VIEW_TYPE);
                });
        });
    }

    public redraw(): void {
        const activeFile: TFile | null = this.app.workspace.getActiveFile();
        const tree = [];
        for (const deckKey in this.plugin.reviewDecks) {
            const deckNode = { title: deckKey, active: false, folders: [] };
            tree.push(deckNode);
            const deck: ReviewDeck = this.plugin.reviewDecks[deckNode.title];
            if (deck.newNotes.length > 0) {
                const folderNode = { title: t("NEW"), notes: [], active: false };
                deckNode.folders.push(folderNode);
                for (const note of deck.newNotes) {
                    const noteNode = { note, active: activeFile && note.path === activeFile.path };
                    folderNode.notes.push(noteNode);
                    if (!folderNode.active && noteNode.active) {
                        folderNode.active = true;
                        if (!deckNode.active) {
                            deckNode.active = true;
                        }
                    }
                }
            }
            if (deck.scheduledNotes.length > 0) {
                const now: number = Date.now();
                let currUnix = -1;
                let folderTitle = "";
                const maxDaysToRender: number = this.plugin.data.settings.maxNDaysNotesReviewQueue;
                let folderNode = null;
                for (const note of deck.scheduledNotes) {
                    // We assume scheduledNotes is sorted
                    if (note.dueUnix != currUnix) {
                        const days: number = Math.ceil((note.dueUnix - now) / (24 * 3600 * 1000));

                        if (days > maxDaysToRender) {
                            break;
                        }

                        if (days === -1) {
                            folderTitle = t("YESTERDAY");
                        } else if (days === 0) {
                            folderTitle = t("TODAY");
                        } else if (days === 1) {
                            folderTitle = t("TOMORROW");
                        } else {
                            folderTitle = new Date(note.dueUnix).toDateString();
                        }

                        folderNode = { title: folderTitle, notes: [], active: false };
                        deckNode.folders.push(folderNode);
                        currUnix = note.dueUnix;
                    }
                    const noteNode = {
                        note: note.note,
                        active: activeFile && note.note.path === activeFile.path,
                    };
                    folderNode.notes.push(noteNode);
                    if (!folderNode.active && noteNode.active) {
                        folderNode.active = true;
                        if (!deckNode.active) {
                            deckNode.active = true;
                        }
                    }
                }
            }
        }

        const rootEl: HTMLElement = createDiv("nav-folder mod-root");
        const childrenEl: HTMLElement = rootEl.createDiv("nav-folder-children");

        for (const deckNode of tree) {
            if (!this.state[deckNode.title]) {
                this.state[deckNode.title] = new Set([deckNode.title, t("TODAY")]);
            }
            const deckState = this.state[deckNode.title];
            const deckCollapsed = !deckState.has(deckNode.title);
            const deckFolderEl: HTMLElement = this.createRightPaneFolder(
                childrenEl,
                deckNode.title,
                deckCollapsed,
                deckNode.active,
                false,
                deckState,
            ).getElementsByClassName("nav-folder-children")[0] as HTMLElement;

            for (const folderNode of deckNode.folders) {
                const folderEl: HTMLElement = this.createRightPaneFolder(
                    deckFolderEl,
                    folderNode.title,
                    !deckState.has(folderNode.title),
                    folderNode.active,
                    deckCollapsed,
                    deckState,
                );
                for (const noteNode of folderNode.notes) {
                    this.createRightPaneFile(
                        folderEl,
                        noteNode.note,
                        noteNode.active,
                        deckCollapsed || !deckState.has(folderNode.title),
                        deckNode,
                        this.plugin,
                    );
                }
            }
        }

        const contentEl: Element = this.containerEl.children[1];
        contentEl.empty();
        contentEl.appendChild(rootEl);
    }

    private createRightPaneFolder(
        parentEl: HTMLElement,
        folderTitle: string,
        collapsed: boolean,
        active: boolean,
        hidden: boolean,
        state: Set<string>,
    ): HTMLElement {
        const folderEl: HTMLDivElement = parentEl.createDiv("nav-folder");
        const folderTitleEl: HTMLDivElement = folderEl.createDiv("nav-folder-title");
        folderEl.createDiv("nav-folder-children");
        const collapseIconEl: HTMLDivElement = folderTitleEl.createDiv(
            "nav-folder-collapse-indicator collapse-icon",
        );

        collapseIconEl.innerHTML = COLLAPSE_ICON;
        if (collapsed) {
            (collapseIconEl.childNodes[0] as HTMLElement).style.transform = "rotate(-90deg)";
        }

        folderTitleEl.createDiv("nav-folder-title-content").setText(folderTitle);
        if (active) {
            folderTitleEl.addClass("is-active");
        }

        if (hidden && !active) {
            folderEl.style.display = "none";
        }

        folderTitleEl.onClickEvent(() => {
            if ((collapseIconEl.childNodes[0] as HTMLElement).style.transform == "rotate(-90deg)") {
                (collapseIconEl.childNodes[0] as HTMLElement).style.transform = "";
                state.add(folderTitle);
            } else {
                (collapseIconEl.childNodes[0] as HTMLElement).style.transform = "rotate(-90deg)";
                state.delete(folderTitle);
            }
            this.redraw();
        });

        return folderEl;
    }

    private createRightPaneFile(
        folderEl: HTMLElement,
        file: TFile,
        fileElActive: boolean,
        hidden: boolean,
        deckNode,
        plugin: SRPlugin,
    ): void {
        const navFileEl: HTMLElement = folderEl
            .getElementsByClassName("nav-folder-children")[0]
            .createDiv("nav-file");
        if (hidden && !fileElActive) {
            navFileEl.style.display = "none";
        }

        const navFileTitle: HTMLElement = navFileEl.createDiv("nav-file-title");
        if (fileElActive) {
            navFileTitle.addClass("is-active");
        }

        navFileTitle.createDiv("nav-file-title-content").setText(file.basename);
        navFileTitle.addEventListener(
            "click",
            async (event: MouseEvent) => {
                event.preventDefault();
                plugin.lastSelectedReviewDeck = deckNode.title;
                await this.app.workspace.getLeaf().openFile(file);
                return false;
            },
            false,
        );

        navFileTitle.addEventListener(
            "contextmenu",
            (event: MouseEvent) => {
                event.preventDefault();
                const fileMenu: Menu = new Menu();
                this.app.workspace.trigger("file-menu", fileMenu, file, "my-context-menu", null);
                fileMenu.showAtPosition({
                    x: event.pageX,
                    y: event.pageY,
                });
                return false;
            },
            false,
        );
    }

    private changeFolderIconToExpanded(folderEl: HTMLElement): void {
        const collapseIconEl = folderEl.find("div.nav-folder-collapse-indicator");
        (collapseIconEl.childNodes[0] as HTMLElement).style.transform = "";
    }
}
