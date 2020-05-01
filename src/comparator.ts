import Post from "./entity/Post";
import Comment from "./entity/Comment";

export interface ComparisonResult {
	newComments: Comment[];
	updatedComments: Comment[];
	newContent?: string;
	changedDate: Date | undefined;
	post: Post;
}

export function comparePosts(old: Post, current: Post) {
	let changes: ComparisonResult = {
		newComments: [],
		updatedComments: [],
		newContent: null,
		changedDate: null,
		post:current
	};

	// Detect article content changes
	if (old.lastUpdate?.getTime() !== current.lastUpdate?.getTime()) {
		changes.newContent = current.content;
		changes.changedDate = current.lastUpdate;
	}

	// Detect new comments
	if (old.comments) {
		changes.newComments = current.comments.filter(
			(comment) => {
				return !old.comments.find((item) => comment.id == item.id)
			}
		);
	} else {
		changes.newComments = current.comments;
	}
	
    
	// Detect changed comments
	if (old.comments){
		changes.updatedComments = current.comments.filter(
			(comment) => {
				let oldComment = old.comments.find((item) => comment.id == item.id);
				if (!oldComment) return false;
				if (
					comment.lastUpdate?.getTime() !== oldComment.lastUpdate?.getTime() 
				) {
					return true
				}
			}
		);
	}
    

	return changes;
}
