import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/context/AuthContext';
import * as Clipboard from 'expo-clipboard';

interface Note {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

export default function NotesScreen() {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  // Debounce saving timer reference
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchNotes = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('user_notes')
      .select('*')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false });

    if (data && !error) {
      setNotes(data);
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Debounced auto-save
  useEffect(() => {
    if (!profile?.id || !activeNoteId) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from('user_notes')
        .update({
          title,
          content,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeNoteId);
      
      if (!error && isMounted.current) {
        // Optimistically update local list so it reflects the auto-save time
        setNotes(prev => prev.map(n => 
          n.id === activeNoteId ? { ...n, title, content, updated_at: new Date().toISOString() } : n
        ));
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [title, content, activeNoteId, profile?.id]);

  const handleCreateNew = async () => {
    if (!profile?.id) return;
    
    // Optimistic creation
    const newNote = {
      user_id: profile.id,
      title: 'Untitled Note',
      content: '',
    };
    
    const { data, error } = await supabase
      .from('user_notes')
      .insert([newNote])
      .select()
      .single();

    if (data && !error) {
      setNotes([data, ...notes]);
      setActiveNoteId(data.id);
      setTitle(data.title);
      setContent(data.content || '');
    } else {
      Alert.alert('Error', 'Could not create new note.');
    }
  };

  const handleSelectNote = (note: Note) => {
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content || '');
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete Note",
      "Are you sure you want to delete this note?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from('user_notes').delete().eq('id', id);
            if (!error) {
              setNotes(notes.filter(n => n.id !== id));
              if (activeNoteId === id) {
                setActiveNoteId(null);
                setTitle('');
                setContent('');
              }
            }
          }
        }
      ]
    );
  };

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    // Simple alert to confirm
    Alert.alert("Copied", "Note content copied to clipboard!");
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Global Notes</Text>
        <TouchableOpacity style={styles.newButton} onPress={handleCreateNew}>
          <Ionicons name="add" size={20} color="#0f141a" />
          <Text style={styles.newButtonText}>New Note</Text>
        </TouchableOpacity>
      </View>

      {activeNoteId && (
        <View style={styles.editorContainer}>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Note Title"
            placeholderTextColor="#888"
          />
          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={setContent}
            placeholder="Type your note here..."
            placeholderTextColor="#888"
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity 
            style={styles.closeEditorButton} 
            onPress={() => setActiveNoteId(null)}
          >
            <Ionicons name="close-circle" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      <FlashList estimatedItemSize={100}
        data={notes}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.noteCard, activeNoteId === item.id && styles.activeNoteCard]}
            onPress={() => handleSelectNote(item)}
          >
            <View style={styles.noteCardHeader}>
              <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
              <View style={styles.noteActions}>
                <TouchableOpacity onPress={() => handleCopy(item.content)} style={styles.actionIcon}>
                  <Ionicons name="copy-outline" size={18} color="#666" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionIcon}>
                  <Ionicons name="trash-outline" size={18} color="#e53935" />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.notePreview} numberOfLines={2}>
              {item.content || 'Empty note...'}
            </Text>
            <Text style={styles.noteDate}>
              {new Date(item.updated_at).toLocaleString()}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f6f2',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0f141a',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f7f6f2',
  },
  newButton: {
    flexDirection: 'row',
    backgroundColor: '#e1c37a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  newButtonText: {
    color: '#0f141a',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  editorContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    position: 'relative',
  },
  closeEditorButton: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  titleInput: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f141a',
    marginBottom: 10,
    paddingRight: 30,
  },
  contentInput: {
    fontSize: 14,
    color: '#333',
    minHeight: 100,
    maxHeight: 200,
  },
  listContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  noteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  activeNoteCard: {
    borderColor: '#e1c37a',
    borderWidth: 2,
  },
  noteCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f141a',
    flex: 1,
  },
  noteActions: {
    flexDirection: 'row',
  },
  actionIcon: {
    marginLeft: 12,
    padding: 4,
  },
  notePreview: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  noteDate: {
    fontSize: 12,
    color: '#aaa',
    fontStyle: 'italic',
  }
});
