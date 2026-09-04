import * as DialogPrimitive from "@radix-ui/react-dialog";

const Drawer = DialogPrimitive.Root;
const DrawerPortal = DialogPrimitive.Portal;
const DrawerOverlay = DialogPrimitive.Overlay;
const DrawerContent = DialogPrimitive.Content;
// Radix Dialog has no Header export; provide a simple div wrapper
const DrawerHeader = ({
	children,
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={className} {...props}>
		{children}
	</div>
);
const DrawerTitle = DialogPrimitive.Title;
const DrawerDescription = DialogPrimitive.Description;
const DrawerClose = DialogPrimitive.Close;
const DrawerTrigger = DialogPrimitive.Trigger;

interface DrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
	className?: string;
}

interface DrawerContentProps {
	children: React.ReactNode;
	className?: string;
}

interface DrawerHeaderProps {
	children: React.ReactNode;
	className?: string;
}

interface DrawerTitleProps {
	children: React.ReactNode;
	className?: string;
}

interface DrawerDescriptionProps {
	children: React.ReactNode;
	className?: string;
}

export {
	Drawer,
	DrawerPortal,
	DrawerOverlay,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerDescription,
	DrawerClose,
	DrawerTrigger,
};
export type {
	DrawerProps,
	DrawerContentProps,
	DrawerHeaderProps,
	DrawerTitleProps,
	DrawerDescriptionProps,
};
