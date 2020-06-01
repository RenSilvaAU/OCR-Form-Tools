// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import React, { useState, useRef, KeyboardEvent } from "react";
import {
    ContextualMenu,
    ContextualMenuItemType,
    IContextualMenuItem,
    FontIcon,
    Spinner,
    SpinnerSize,
    Customizer,
} from "office-ui-fabric-react";
import "./generatorPane.scss";
import "../condensedList/condensedList.scss";
import GeneratorEditor from "./generatorEditor";
import { IGenerator, IGeneratorRegion } from "../../pages/editorPage/editorPage";
import { dark, TagOperationMode, onItemRename, FormattedItemContextMenu, ColorPickerPortal } from "../tagInput/tagInput";
import { toast } from "react-toastify";
import TagInputItem, { ITagClickProps } from "../tagInput/tagInputItem";

import { AlignPortal } from "../align/alignPortal";
import { ColorPicker } from "../colorPicker";
import { FormattedItem } from "../../../../models/applicationState";
// tslint:disable-next-line:no-var-requires
const tagColors = require("../../common/tagColors.json");

/**
 * TODO
 * per region info bugbash
 * regression test for tags
 * onleave and onenter
 * num copies info
 * add search bar
 * ughhh we probably need logic to not conflict with old tagssssss
 *
 * enable context menu
 */

/**
 * Properties for Generator Pane
 * @member generatorRegion - Info for selected region
 */
export interface IGeneratorPaneProps {
    generators: IGenerator[]
    selectedIndex: number,
    generatorsLoaded: boolean,
    onSelectedGenerator: (region?: IGeneratorRegion) => void,
    onGeneratorsChanged: (newGenerators?: IGenerator[]) => void,
    // skipping onRename, onDelete for now
}

const strings = {
    generator: {
        title: "Generators",
        search: {
            placeholder: "Search generators"
        },
        generateCount: "Generation Count:"
    }
}

/**
 * @name - Generator Pane
 * @description - Controlling generator settings for pane
 */
const GeneratorPane: React.FunctionComponent<IGeneratorPaneProps> = (props) => {
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [generateCount, setGenerateCount] = useState(1);
    const [operation, setOperation] = useState(TagOperationMode.None);

    const headerRef = useRef<HTMLDivElement>();

    const itemRefs = new Map<string, React.MutableRefObject<HTMLDivElement>>(); // er...

    if (props.generators.length === 0) {
        return null;
    }

    const selectedGenerator = props.selectedIndex !== -1 ? props.generators[props.selectedIndex]: null;

    const onEditorClick = (region: IGenerator, clickProps: ITagClickProps) => {
        // props describe the type of click that occurred
        // TODO add them props back (needed for the type assignment)
        // TODO support color again
        const { selectedIndex } = props;
        const selected = selectedGenerator && selectedGenerator.uid === region.uid;
        let newOperation;
        if (clickProps.clickedDropDown) {
            const showContextualMenu = !selectedIndex || !selected
                || operation !== TagOperationMode.ContextualMenu;
            newOperation = showContextualMenu ? TagOperationMode.ContextualMenu : TagOperationMode.None;
            if (showContextualMenu) {
                props.onSelectedGenerator(region);
            }
        } else if (clickProps.clickedColor) {
            const showColorPicker = operation !== TagOperationMode.ColorPicker;
            newOperation = showColorPicker ? TagOperationMode.ColorPicker : TagOperationMode.None;
            if (showColorPicker) {
                props.onSelectedGenerator(region);
            }
        } else { // Select tag
            newOperation = selected ? operation : TagOperationMode.None;
            const deselect = selected && operation === TagOperationMode.None;
            // do we deselect? By default, if we click on already selected, do deselect
            if (selected && operation === TagOperationMode.None) {
                props.onSelectedGenerator();
            }
            if (!deselect) {
                props.onSelectedGenerator(region);
            }
        }
        setOperation(newOperation);
    }

    const setItemRef = (divRef: React.MutableRefObject<HTMLDivElement>, item: FormattedItem) => {
        // TODO use id instead?
        itemRefs.set(item.name, divRef);
    }

    const renderGenerators = () => {
        const { generators, selectedIndex } = props;
        let regions = generators;
        if (searchQuery.length) {
            regions = regions.filter((r) => !r.name ||
            r.name.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        const onCancel = () => {
            setOperation(TagOperationMode.None);
        }
        const perRegionProps = regions.map((r,index) => ({
            region: r,
            index: 1, // why?
            isRenaming: operation === TagOperationMode.Rename && index === selectedIndex,
            isSelected: index === selectedIndex,
            onClick: onEditorClick.bind(this, r),
            onRename: onItemRename.bind(this, generators, r, onCancel, handleNameChange),
            setRef: (divRef) => setItemRef(divRef, r)
        }));
        return regions.map((r, index) =>
            <GeneratorEditor
                {...perRegionProps[index]}
                key={r.uid}
            />);
    }

    const onSearchKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            setSearchOpen(false);
        }
    }

    const setValidGenerateCount = (event: any) => {
        const { value, min, max } = event.target;
        const validValue = Math.max(Number(min), Math.min(Number(max), Number(value)));
        setGenerateCount(validValue);
    }

    const onHideContextualMenu = () => {
        setOperation(TagOperationMode.None);
    }

    const toggleRenameMode = (item: FormattedItem) => {
        const newOperation = operation === TagOperationMode.Rename
            ? TagOperationMode.None : TagOperationMode.Rename;
        setOperation(newOperation);
    }

    const onItemChanged = (oldItem: IGenerator, newItem: Partial<IGenerator>) => {
        // TODO why do we bother with spread if the update is entire?
        const newGenerators = props.generators.map(g => {
            return g.uid === oldItem.uid ? {...g, ...newItem} : g;
        })
        props.onGeneratorsChanged(newGenerators);
        // find the selected item and change it and call the generators changed
    }

    const onReOrder = (item: IGenerator, displacement: number) => {
        if (!item) {
            return;
        }
        const items = [...props.generators];
        const currentIndex = items.indexOf(item);
        const newIndex = currentIndex + displacement;
        if (newIndex < 0 || newIndex >= items.length) {
            return;
        }
        items.splice(currentIndex, 1);
        items.splice(newIndex, 0, item);
        // TODO deal with selected index (is that why they tracked the active item instead?)
        props.onGeneratorsChanged(items);
    }

    const onDelete = (item: IGenerator) => {
        if (!item) {
            return;
        }
        this.props.onGeneratorDeleted(item);
    }

    const handleColorChange = (color: string) => {
        // ok, are we sure this only fires when a generator is selected?
        if (!selectedGenerator) {
            // this is bad
            console.error("no generator selected on color change?");
            return;
        }
        setOperation(TagOperationMode.None);
        onItemChanged(selectedGenerator, {color});
    }

    // Odd arg due to tagInput format
    const handleNameChange = (oldItem: IGenerator, newItem: IGenerator, cancelCallback: () => void) => {
        onItemChanged(oldItem, newItem); // drop cancel since we have no confirmation box
    }

    const selectedRef = selectedGenerator ? itemRefs.get(selectedGenerator.name) : null;

    return (
        <div className="tag-input">
            <div ref={headerRef} className="tag-input-header p-2">
                <span className="tag-input-title">{strings.generator.title}</span>
            </div>
            <div className="tag-input-body-container">
            {
                props.generatorsLoaded ?
                    <div className="tag-input-body">
                        <div className="tag-input">
                            <span className="tag-input-text-input-row">
                                <span className="tag-input-input-row-desc">
                                    {strings.generator.generateCount}
                                </span>
                                <input
                                    className="tag-search-box"
                                    type="number"
                                    onChange={setValidGenerateCount}
                                    placeholder="1"
                                    min="1"
                                    max="10"
                                />
                            </span>
                        </div>
                        {
                            searchOpen &&
                            <div className="tag-input-text-input-row search-input">
                                <input
                                    className="tag-search-box"
                                    type="text"
                                    onKeyDown={onSearchKeyDown}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={strings.generator.search.placeholder}
                                    autoFocus={true}
                                />
                                <FontIcon iconName="Search" />
                            </div>
                        }
                        <div className="tag-input-items">
                            {renderGenerators()}
                            <Customizer {...dark}>
                                {
                                    operation === TagOperationMode.ContextualMenu && selectedRef &&
                                    <FormattedItemContextMenu
                                        onRename={toggleRenameMode}
                                        onDelete={onDelete}
                                        onReOrder={onReOrder}
                                        selectedRef={selectedRef}
                                        onHideContextualMenu={onHideContextualMenu}
                                        onItemChanged={onItemChanged}
                                    />
                                }
                            </Customizer>
                            <ColorPickerPortal
                                selectedItem={selectedGenerator}
                                operation={operation}
                                handleColorChange={handleColorChange}
                                alignRef={headerRef}
                            />
                        </div>
                    </div>
                :
                <Spinner className="loading-generator" size={SpinnerSize.large}/>
            }
            </div>
        </div>
    );
}

export default GeneratorPane;