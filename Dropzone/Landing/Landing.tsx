import React, { Component } from "react";
import Dropzone from "react-dropzone";
import { FileIcon, defaultStyles, DefaultExtensionType } from "react-file-icon";
import { IInputs } from "../generated/ManifestTypes";
import {
  createRelatedNote,
  getRelatedNotes,
  updateRelatedNote,
  deleteRelatedNote,
  duplicateRelatedNote,
} from "../DataverseActions";
import { FileData } from "../Interfaces";
import "./Landing.css";
import {
  IconButton,
  DefaultButton,
  PrimaryButton,
  TextField,
  Dialog,
  DialogType,
  DialogFooter,
  Text,
  Stack,
  IStackStyles,
  ITextStyles,
  IStackTokens,
  CommandButton,
} from "@fluentui/react";
import { Tooltip } from "react-tippy";
import "react-tippy/dist/tippy.css";
import toast, { Toaster } from "react-hot-toast";

export interface LandingProps {
  context?: ComponentFramework.Context<IInputs>;
}

interface LandingState {
  files: FileData[];
  editingFileId?: string;
  selectedFiles: string[];
}

type FileAction = "edit" | "download" | "duplicate" | "delete";

const ribbonStyles: IStackStyles = {
  root: {
    alignItems: "center",
    display: "flex",
    width: '100%',
    justifyContent: "space-between",
  },
};

const textStyles: ITextStyles = {
  root: {
    margin: "0 10px",
    fontWeight: "normal",
    color: "#000",
  },
};

const ribbonStackTokens: IStackTokens = { childrenGap: 10 };

export class Landing extends Component<LandingProps, LandingState> {
  constructor(props: LandingProps) {
    super(props);
    this.removeFile = this.removeFile.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.state = {
      files: [],
      editingFileId: undefined,
      selectedFiles: [],
    };
  }

  componentDidMount() {
    this.loadExistingFiles();
  }

  getFileExtension(filename: string): DefaultExtensionType {
    const extension = filename.split(".").pop()?.toLowerCase() as
      | DefaultExtensionType
      | undefined;
    return extension && extension in defaultStyles ? extension : "txt";
  }

  handleDrop = (acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onload = () => {
        const binaryStr = reader.result as string;
        const createNotePromise = createRelatedNote(
          this.props.context!,
          file.name,
          binaryStr,
          file.size,
          file.type
        );

        toast.promise(createNotePromise, {
          loading: "Uploading file...",
          success: (res) => {
            if (res.noteId) {
              this.setState((prevState) => {
                const newFiles = [
                  ...prevState.files,
                  {
                    filename: file.name,
                    filesize: file.size,
                    documentbody: binaryStr,
                    mimetype: file.type,
                    noteId: res.noteId,
                    createdon: new Date(),
                    subject: "",
                    notetext: "",
                  },
                ];
                newFiles.sort(
                  (a, b) => b.createdon.getTime() - a.createdon.getTime()
                );
                return { files: newFiles };
              });
              return `File ${file.name} uploaded successfully!`;
            } else {
              throw new Error("Note ID was not returned");
            }
          },
          error: "Error uploading file",
        });
      };

      reader.onerror = () => {
        toast.error(`Error reading file: ${file.name}`);
      };

      reader.readAsDataURL(file);
    });
  };

  loadExistingFiles = async () => {
    if (!this.props.context) {
      console.error("Component Framework context is not available.");
      return;
    }
    const response = await getRelatedNotes(this.props.context);
    if (response.success) {
      const filesData: FileData[] = response.data.map((item: any) => ({
        filename: item.filename,
        filesize: item.filesize,
        documentbody: item.documentbody,
        mimetype: item.mimetype,
        noteId: item.annotationid,
        createdon: new Date(item.createdon),
        subject: item.subject,
        notetext: item.notetext,
      }));
      this.setState({ files: filesData });
    } else {
      console.error("Failed to retrieve files:", response.message);
    }
  };

  downloadFile = (fileData: FileData) => {
    if (!fileData.documentbody || !fileData.mimetype || !fileData.filename) {
      toast.error("Missing file data for download");
      return;
    }

    try {
      toast.loading("Preparing download...");
      const byteCharacters = atob(fileData.documentbody);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: fileData.mimetype });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileData.filename);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success(`${fileData.filename} downloaded successfully!`);
    } catch (error) {
      toast.error(`Failed to download file: ${(error as Error).message}`);
    }
  };

  duplicateFile = async (noteId: string) => {
    const { context } = this.props;

    const duplicationPromise = duplicateRelatedNote(context!, noteId);
    toast.promise(duplicationPromise, {
      loading: "Duplicating file...",
      success: (response) => {
        this.loadExistingFiles();
        return `File duplicated successfully!`;
      },
      error: (err) => `Failed to duplicate file: ${err.message}`,
    });
  };

  removeFile = async (noteId?: string) => {
    if (!noteId) {
      console.error("No note ID provided for deletion");
      toast.error("No note ID provided");
      return;
    }

    this.setState((prevState) => ({
      files: prevState.files.map((file) =>
        file.noteId === noteId ? { ...file, isLoading: true } : file
      ),
    }));

    toast.promise(deleteRelatedNote(this.props.context!, noteId), {
      loading: "Deleting file...",
      success: () => {
        this.setState((prevState) => ({
          files: prevState.files.filter((file) => file.noteId !== noteId),
        }));
        return "File successfully deleted!";
      },
      error: (err) => {
        this.setState((prevState) => ({
          files: prevState.files.map((file) =>
            file.noteId === noteId ? { ...file, isLoading: false } : file
          ),
        }));
        console.error("Toast Error: ", err);
        return `Failed to delete file: ${err.message || "Unknown error"}`;
      },
    });
  };

  toggleEditModal = (noteId?: string) => {
    this.setState({ editingFileId: noteId });
  };

  handleEdit = (noteId?: string) => {
    this.toggleEditModal(noteId);
  };

  saveChanges = async (
    noteId: string,
    subject: string,
    notetext: string
  ): Promise<void> => {
    toast
      .promise(
        updateRelatedNote(this.props.context!, noteId, subject, notetext),
        {
          loading: "Saving changes...",
          success: "Changes saved successfully!",
          error: "Failed to save changes",
        }
      )
      .then((response) => {
        if (response.success) {
          this.setState((prevState) => ({
            files: prevState.files.map((file) =>
              file.noteId === noteId
                ? { ...file, subject, notetext, isEditing: false }
                : file
            ),
          }));
          this.toggleEditModal(noteId);
        } else {
          console.error("Failed to update note:", response.message);
        }
      });
  };

  formatFileSize(sizeInBytes: number) {
    const sizeInMB = sizeInBytes / 1048576;
    return `${sizeInMB.toFixed(2)} MB`;
  }

  middleEllipsis(filename: string, maxLength: number = 19): string {
    if (filename.length < maxLength) {
      return filename;
    }
    const lastDotIndex = filename.lastIndexOf(".");
    const extension = filename.substring(lastDotIndex + 1);
    const name = filename.substring(0, lastDotIndex);
    const startChars = 9;
    const endChars = 3;
    const start = name.substring(0, startChars);
    const end = name.substring(name.length - endChars);

    if (end.length < 3 && name.length - 3 > startChars) {
      return `${start}...${name.slice(-3)}.${extension}`;
    }
    return `${start}...${end}.${extension}`;
  }

  performActionOnSelectedFiles = (action: FileAction) => {
    this.state.selectedFiles.forEach((noteId) => {
      const file = this.state.files.find((f) => f.noteId === noteId);
      if (!file) {
        toast.error("File not found.");
        return;
      }

      if (action === "edit") {
        this.handleEdit(noteId);
      } else if (action === "duplicate") {
        this.duplicateFile(noteId);
      } else if (action === "download") {
        this.downloadFile(file);
      } else if (action === "delete") {
        this.removeFile(noteId);
      }
    });

    this.setState({ selectedFiles: [] });
  };

  renderRibbon = () => {
    const { selectedFiles } = this.state;
    return (
      <Stack horizontal styles={ribbonStyles} className="easeIn">
        <Stack horizontal tokens={ribbonStackTokens}>
          <CommandButton
            iconProps={{ iconName: "Edit" }}
            text="Edit"
            onClick={() => this.performActionOnSelectedFiles("edit")}
            disabled={selectedFiles.length === 0}
            className="icon-button"
          />
          <CommandButton
            iconProps={{ iconName: "Download" }}
            text="Download"
            onClick={() => this.performActionOnSelectedFiles("download")}
            disabled={selectedFiles.length === 0}
            className="icon-button"
          />
          <CommandButton
            iconProps={{ iconName: "Copy" }}
            text="Duplicate"
            onClick={() => this.performActionOnSelectedFiles("duplicate")}
            disabled={selectedFiles.length === 0}
            className="icon-button"
          />
          <CommandButton
            iconProps={{ iconName: "Delete" }}
            text="Delete"
            onClick={() => this.performActionOnSelectedFiles("delete")}
            disabled={selectedFiles.length === 0}
            className="icon-button"
          />
        </Stack>
        <Stack>
        <Text styles={textStyles}>{`${selectedFiles.length} ${
          selectedFiles.length === 1 ? "file" : "files"
        } selected`}</Text>
        </Stack>
      </Stack>
    );
  };

  toggleFileSelection = (noteId: string) => {
    const isSelected = this.state.selectedFiles.includes(noteId);
    this.setState((prevState) => ({
      selectedFiles: isSelected
        ? prevState.selectedFiles.filter((id) => id !== noteId)
        : [...prevState.selectedFiles, noteId],
    }));
  };

  render() {
    const { files, selectedFiles, editingFileId } = this.state;
    const isEmpty = files.length === 0;
    const entityIdExists = (this.props.context as any).page.entityId;
    const editingFile = files.find((file) => file.noteId === editingFileId);

    if (!entityIdExists) {
      return (
        <div className="record-not-created-message">
          This record hasn&apos;t been created yet. To enable file upload,
          create this record.
        </div>
      );
    }
    return (
      <>
        <Toaster position="top-right" reverseOrder={false} />

        {editingFile && (
          <Dialog
            hidden={!editingFileId}
            onDismiss={() => this.toggleEditModal()}
            dialogContentProps={{
              type: DialogType.normal,
              title: "Edit Note",
              subText: "Update the title and description of your note.",
            }}
          >
            <TextField
              label="Title"
              value={editingFile.subject || ""}
              onChange={(e, newValue) => {
                const updatedFiles = files.map((file) =>
                  file.noteId === editingFileId
                    ? { ...file, subject: newValue }
                    : file
                );
                this.setState({ files: updatedFiles });
              }}
            />
            <TextField
              label="Description"
              multiline
              rows={3}
              value={editingFile.notetext || ""}
              onChange={(e, newValue) => {
                const updatedFiles = files.map((file) =>
                  file.noteId === editingFileId
                    ? { ...file, notetext: newValue }
                    : file
                );
                this.setState({ files: updatedFiles });
              }}
            />
            <DialogFooter>
              <PrimaryButton
                onClick={() =>
                  this.saveChanges(
                    editingFile.noteId!,
                    editingFile.subject!,
                    editingFile.notetext!
                  )
                }
                text="Save"
              />
              <DefaultButton
                onClick={() => this.toggleEditModal()}
                text="Cancel"
              />
            </DialogFooter>
          </Dialog>
        )}
        <div className="ribbon-dropzone-wrapper">
          {selectedFiles.length > 0 && this.renderRibbon()}
          <Dropzone onDrop={this.handleDrop}>
            {({ getRootProps, getInputProps }) => (
              <div className="dropzone-wrapper">
                <div
                  {...getRootProps()}
                  className={`dropzone ${isEmpty ? "empty" : ""}`}
                >
                  <input {...getInputProps()} />
                  {isEmpty ? (
                    <p>
                      Drag &apos;n&apos; drop files here or click to select
                      files
                    </p>
                  ) : (
                    files.map((file) => (
                      <div
                        key={file.noteId}
                        className={`file-box ${
                          this.state.selectedFiles.includes(file.noteId || "")
                            ? "selected"
                            : ""
                        }`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          this.toggleFileSelection(file.noteId!);
                        }}
                      >
                        <div className="file-image">
                          <FileIcon
                            extension={this.getFileExtension(file.filename)}
                            {...defaultStyles[
                              this.getFileExtension(file.filename)
                            ]}
                          />
                        </div>
                        <Tooltip
                          title={file.filename}
                          position="top"
                          trigger="mouseenter"
                          arrow={true}
                          arrowSize="regular"
                          theme="light"
                        >
                          <p className="file-name">
                            {this.middleEllipsis(file.filename)}
                          </p>
                        </Tooltip>
                        <p className="file-size">
                          {this.formatFileSize(file.filesize)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </Dropzone>
        </div>
      </>
    );
  }
}

export default Landing;
