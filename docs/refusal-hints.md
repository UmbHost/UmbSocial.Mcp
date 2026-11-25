| Code | Hint |
| ---- | ---- |
| `addon.not_installed` | The add-on this tool needs isn't installed on the site any more. |
| `ai.brief_or_link` | Give a brief or a link, and not both. |
| `ai.needs_review` | A person must review this post in the Umbraco backoffice before it can be scheduled. Leave it as a draft, or submit it for approval if the site uses approvals. |
| `ai.not_configured` | UmbSocial AI isn't set up on this site. Someone with Manage settings sets it up in Social's AI settings. |
| `ai.too_many` | Too many AI requests. Wait a minute before trying again. |
| `ai.unavailable` | The site's AI provider isn't answering. Try again later, or write the text yourself. |
| `ai.vision_unsupported` | The site's AI model can't read images. Write the alt text yourself. |
| `approval.cancelled` | The site refused the approval step; its reason follows the code. |
| `approval.changed` | The post changed while it was being approved. Get it again, then try again. |
| `approval.disabled` | Approvals are switched off for this site. Leave the post as a draft and ask a person to schedule it. |
| `approval.not_awaiting` | This post isn't awaiting approval: it has been approved or returned already, or was never submitted. |
| `approval.not_draft` | Only a draft can be submitted for approval. |
| `approval.own_post` | This site doesn't let people approve their own posts. Someone else must approve it. |
| `approval.self_edited` | The approver was the last to change this post, and this site doesn't let people approve their own changes. Someone else must approve it. |
| `approval.when_invalid` | Approving needs a time: Queue, At, Now or, for a post with a page, OnPagePublish. |
| `automation.exists` | That document type already has an automation. It is changed, turned on or off and deleted in Umbraco Automate. |
| `automation.no_workspace` | No Umbraco Automate workspace can hold the automation. Ask an administrator to set one up. |
| `campaign.merge_same` | A campaign can't be merged into itself. |
| `campaign.name_taken` | Another campaign has that name. Choose another, or merge the two. |
| `campaign.not_found` | No campaign with that key. Use list-campaigns. |
| `campaign.unknown` | That campaign doesn't exist any more. Use list-campaigns. |
| `campaign.value_taken` | Another campaign has that value. |
| `channel.limit` | The site's edition allows no more channels. |
| `channel.unknown` | That channel has been removed, so nothing can be sent to it. |
| `confirmation.required` | This step can't be undone, and this client can't ask the person to confirm it. Ask the person in the conversation first; only if they say yes, call the tool again with confirm: true. |
| `engage.contract_changed` | Umbraco Engage on this site answered in a way this version of UmbSocial Engage doesn't expect. Ask an administrator to update UmbSocial. |
| `engage.range_invalid` | Give a range of at most 366 days, with the end on or after the start. |
| `engage.too_many_codes` | Ask for the visits of at most 200 short links at a time. |
| `engage.too_many_keys` | Ask for the figures of at most 200 posts at a time. |
| `field.required:culture` | The page varies by language, so the post must name one of its languages. |
| `field.required:note` | Returning a post needs a note saying what to change. |
| `field.too_long:note` | The note can be at most 1000 characters. |
| `hashtag.name_taken` | Another hashtag group has that name. |
| `hashtag.not_found` | No hashtag group with that key. Use list-hashtags. |
| `history.range_invalid` | The end must be after the start. |
| `history.range_too_long` | Export at most 366 days at a time. |
| `input.channel_not_chosen` | Every channel in channelTexts or options must also be one of the post's channels. |
| `input.delay_needs_page_publish` | pageDelayMinutes goes only with OnPagePublish; leave it out for Queue, At or Now. |
| `licence.channel_limit` | The site's edition allows no more channels. |
| `licence.engage_required` | This needs UmbSocial Engage, and the site's UmbSocial licence doesn't include it (it may have lapsed since this server started). |
| `licence.pro_required` | This needs UmbSocial Pro, and the site isn't licensed (its licence may have lapsed since this server started). |
| `link.https_required` | Links must start with https://. |
| `link.not_allowed` | The site won't fetch that address. |
| `link.unreachable` | The site couldn't read that page. Check the address, or write the link card yourself. |
| `media.unknown` | No media item with that key. Find the image with the cms tools. |
| `media.unresolvable` | The site can't give that media item a public address. |
| `metrics.too_many_keys` | Ask for the figures of at most 200 posts at a time. |
| `page.culture_invalid` | The page doesn't have that language. Choose one of its languages, or none for a page that doesn't vary by language. |
| `page.no_access` | This API user lacks Umbraco's Browse permission on that page. Ask an administrator for access. |
| `page.not_found` | No page with that key exists, or it is in the recycle bin. Find the page with the cms tools. |
| `post.changed` | Someone changed this post since you read it. Get it again, then make your change. |
| `post.live` | This post is already live on at least one channel, so it can't be changed back into a draft. |
| `post.not_draft` | Only a draft, or a post awaiting approval, can be changed or deleted through this server, so a post on the calendar or already sent stays as a person left it. Ask a person to change it in the Umbraco backoffice. |
| `post.not_found` | No post with that key that this user may read. Use list-posts. |
| `post.not_yours` | Without the Schedule permission, this user may change or delete only its own drafts. |
| `post.schedule_forbidden` | This user may save drafts only. |
| `post.sealed` | This post is sealed and can't be changed. |
| `rate.limited` | Too many requests. Wait a minute before trying again. |
| `schedule.delay_invalid` | pageDelayMinutes is 0, 60 or 1440; leave it out for the queue's next free slot. |
| `schedule.needs_page` | Going out when the page goes live needs a post tied to a page. |
| `schedule.past` | At needs an atUtc in the future. Get the post again before retrying, in case it changed. |
| `schedule.range_too_long` | Ask for at most 42 days of slots at a time, with the end after the start. Move the range on to see later slots. |
| `short_link.not_found` | No short link with that code. Use list-short-links. |
| `short_links.too_many_keys` | Ask for the clicks of at most 200 posts at a time. |
| `tag.name_taken` | Another tag has that name. |
| `tag.not_found` | No tag with that key. Use list-tags. |
| `tag.too_many` | A post can have at most 10 tags. |
| `target.cancelled` | The site refused this step; its reason follows the code. |
| `target.not_found` | No channel target with that id. Take it from the targets of get-post. |
| `target.not_resolvable` | Only a Failed or Unknown channel can be marked as published. |
| `target.not_retryable` | Only a Failed or Unknown channel can be sent again. |
| `target.run_active` | The channel's run may only be slow, and could still post. Leave it for a person to check in Automate, so the post isn't sent twice. |
| `template.name_taken` | Another template has that name. |
| `template.not_found` | No template with that key. Use list-templates. |
| `template.not_yours` | Without Manage settings, this user may change or delete only its own templates. |
| `thread.partly_posted` | Part of this thread is already live. A person posts the rest on the network, then marks the channel as published. |
| `token.rejected` | The site rejected this server's access token. The next call asks for a new one; if that is refused too, check the API user's client ID and secret, and that the user is still enabled. |
| `utm.field_locked` | The site sets this UTM field centrally, so a post can't change it. Leave it out. |
| `utm.value_too_long` | A UTM value can be at most 100 characters. |
| `verb.missing` | This API user's group lacks the Social permission this needs. |
