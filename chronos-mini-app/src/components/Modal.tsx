import { ReactNode } from "react";

interface ModalProps {
	title: string;
	onClose: () => void;
	children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-box" onClick={(e) => e.stopPropagation()}>
				<div className="modal-title">{title}</div>
				<div className="modal-body">{children}</div>
			</div>
		</div>
	);
}
