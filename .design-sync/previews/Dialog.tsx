import * as React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "frontend";

export const Confirm = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete project?</DialogTitle>
        <DialogDescription>
          &quot;Interview corpus 2026&quot; and its analyses will be permanently
          removed. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">Delete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
